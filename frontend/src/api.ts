import type {
  AdaptRequest, Health, Project, StepName, SyllablesResult, Variant, WatermarkResult,
} from "./types";

/** Erreur API avec message lisible en français. */
export class ApiError extends Error {
  status: number;
  network: boolean;
  /** true si la réponse venait vraiment du backend (corps JSON) */
  json: boolean;
  constructor(message: string, status = 0, network = false, json = false) {
    super(message);
    this.status = status;
    this.network = network;
    this.json = json;
  }
}

type Listener = (down: boolean) => void;
const listeners = new Set<Listener>();
let backendDown = false;

/** Abonnement à l'état « backend injoignable ». */
export function onBackendStatus(fn: Listener): () => void {
  listeners.add(fn);
  fn(backendDown);
  return () => listeners.delete(fn);
}
function setDown(v: boolean) {
  if (v !== backendDown) {
    backendDown = v;
    listeners.forEach((l) => l(v));
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    setDown(true);
    throw new ApiError("Backend injoignable, lancez backend/run.sh", 0, true);
  }
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("json") ? await res.json().catch(() => null) : await res.text().catch(() => "");
  // Backend éteint derrière le proxy Vite : réponse 500/502/504 au corps vide
  if (res.status >= 500 && !ct.includes("json") && !String(body ?? "").trim()) {
    setDown(true);
    throw new ApiError("Backend injoignable, lancez backend/run.sh", res.status, true);
  }
  setDown(false);
  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    if (body && typeof body === "object" && "detail" in body) {
      const d = (body as { detail: unknown }).detail;
      msg = typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x?.msg ?? String(x)).join(" ; ") : JSON.stringify(d);
    } else if (typeof body === "string" && body.trim() && body.length < 300) {
      msg = body;
    }
    throw new ApiError(msg, res.status, false, ct.includes("json"));
  }
  return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: data === undefined ? undefined : JSON.stringify(data),
});

// ---------------------------------------------------------------------------
// Mode démo hors ligne : si le backend est injoignable mais que /offline/projects.json
// existe (export de scripts/export_offline.py), on lit les projets figés en lecture seule.
// Dès que /api/health répond, le comportement normal revient automatiquement.

export const OFFLINE_MSG = "Indisponible en mode démo hors ligne : le backend n'est pas en ligne.";

type OfflineListener = (offline: boolean) => void;
const offlineListeners = new Set<OfflineListener>();
let offline = false;

/** Abonnement au mode démo hors ligne. */
export function onOfflineMode(fn: OfflineListener): () => void {
  offlineListeners.add(fn);
  fn(offline);
  return () => offlineListeners.delete(fn);
}
export const isOffline = () => offline;
function setOffline(v: boolean) {
  if (v !== offline) {
    offline = v;
    offlineListeners.forEach((l) => l(v));
  }
}

let offlineIndex: Promise<Project[] | null> | null = null;
/** Liste figée (mise en cache) ; null si aucun export n'est déployé. */
function loadOfflineIndex(): Promise<Project[] | null> {
  if (!offlineIndex) {
    offlineIndex = fetch("/offline/projects.json")
      .then(async (r) => {
        if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return null;
        const list: unknown = await r.json();
        return Array.isArray(list) ? (list as Project[]) : null;
      })
      .catch(() => null);
  }
  return offlineIndex;
}

async function backendAlive(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch("/api/health", { signal: ctrl.signal });
    return r.ok && (r.headers.get("content-type") ?? "").includes("json");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let probe: Promise<boolean> | null = null;
/** Faut-il basculer en hors ligne ? (backend muet ET export disponible) */
function shouldGoOffline(): Promise<boolean> {
  if (offline) return Promise.resolve(true);
  if (!probe) {
    probe = (async () => {
      if (await backendAlive()) return false;
      const idx = await loadOfflineIndex();
      if (idx) setOffline(true);
      return !!idx;
    })().finally(() => { probe = null; });
  }
  return probe;
}

/** Essaie le backend ; s'il est absent et qu'un export existe, lit la version figée. */
async function withOffline<T>(online: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (offline) return fallback();
  try {
    return await online();
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    // Une vraie réponse JSON du backend (ex. 404 projet) n'est pas une panne.
    if (e instanceof ApiError && e.json) throw e;
    if (await shouldGoOffline()) return fallback();
    throw e;
  }
}

async function offlineProject(id: string): Promise<Project> {
  const idx = await loadOfflineIndex();
  if (!idx?.some((p) => p.id === id)) throw new ApiError("Ce projet n'est pas disponible dans la démo hors ligne.", 404);
  const r = await fetch(`/offline/${encodeURIComponent(id)}/project.json`);
  if (!r.ok) throw new ApiError("Ce projet n'est pas disponible dans la démo hors ligne.", r.status);
  return (await r.json()) as Project;
}

/** Action d'écriture ou de calcul : refusée proprement en mode hors ligne. */
function writeAction<T>(fn: () => Promise<T>): Promise<T> {
  if (offline) return Promise.reject(new ApiError(OFFLINE_MSG, 0));
  return fn();
}

export const api = {
  health: async () => {
    try {
      const h = await request<Health>("/api/health");
      setOffline(false);
      return h;
    } catch (e) {
      if (!(e instanceof ApiError && e.json) && (await loadOfflineIndex())) setOffline(true);
      throw e;
    }
  },
  listProjects: () => withOffline(
    () => request<Project[]>("/api/projects"),
    async () => (await loadOfflineIndex()) ?? [],
  ),
  getProject: (id: string) => withOffline(
    () => request<Project>(`/api/projects/${id}`),
    () => offlineProject(id),
  ),
  deleteProject: (id: string) => writeAction(() => request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" })),
  createProject: (f: {
    file: File; title: string; artist: string; source_lang: string; target_lang: string; consent: boolean;
  }) => writeAction(() => {
    const fd = new FormData();
    fd.append("file", f.file);
    fd.append("title", f.title);
    fd.append("artist", f.artist);
    fd.append("source_lang", f.source_lang);
    fd.append("target_lang", f.target_lang);
    fd.append("consent", f.consent ? "true" : "false");
    return request<Project>("/api/projects", { method: "POST", body: fd });
  }),
  runStep: (id: string, step: StepName, body?: Record<string, unknown>) =>
    writeAction(() => request<Project>(`/api/projects/${id}/steps/${step}`, json("POST", body ?? {}))),
  saveLines: (id: string, lines: { index: number; text: string; meaning: string }[]) =>
    writeAction(() => request<Project>(`/api/projects/${id}/lines`, json("PUT", { lines }))),
  saveChoices: (id: string, choices: { index: number; text: string }[]) =>
    writeAction(() => request<Project>(`/api/projects/${id}/choices`, json("PUT", { choices }))),
  uploadGuide: (id: string, file: Blob, name = "guide.wav") => writeAction(() => {
    const fd = new FormData();
    fd.append("file", file, name);
    return request<Project>(`/api/projects/${id}/guide`, { method: "POST", body: fd });
  }),
  adapt: (req: AdaptRequest) => writeAction(() => request<{ variants: Variant[] }>("/api/adapt", json("POST", req))),
  syllables: (text: string, lang: string, signal?: AbortSignal) =>
    writeAction(() => request<SyllablesResult>("/api/syllables", { ...json("POST", { text, lang }), signal })),
  detectWatermark: (file: File) => writeAction(() => {
    const fd = new FormData();
    fd.append("file", file);
    return request<WatermarkResult>("/api/watermark/detect", { method: "POST", body: fd });
  }),
};

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
