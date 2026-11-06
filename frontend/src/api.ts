import type {
  AdaptRequest, Health, Project, StepName, SyllablesResult, Variant, WatermarkResult,
} from "./types";

/** Erreur API avec message lisible en français. */
export class ApiError extends Error {
  status: number;
  network: boolean;
  constructor(message: string, status = 0, network = false) {
    super(message);
    this.status = status;
    this.network = network;
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
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: data === undefined ? undefined : JSON.stringify(data),
});

export const api = {
  health: () => request<Health>("/api/health"),
  listProjects: () => request<Project[]>("/api/projects"),
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
  deleteProject: (id: string) => request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  createProject: (f: {
    file: File; title: string; artist: string; source_lang: string; target_lang: string; consent: boolean;
  }) => {
    const fd = new FormData();
    fd.append("file", f.file);
    fd.append("title", f.title);
    fd.append("artist", f.artist);
    fd.append("source_lang", f.source_lang);
    fd.append("target_lang", f.target_lang);
    fd.append("consent", f.consent ? "true" : "false");
    return request<Project>("/api/projects", { method: "POST", body: fd });
  },
  runStep: (id: string, step: StepName, body?: Record<string, unknown>) =>
    request<Project>(`/api/projects/${id}/steps/${step}`, json("POST", body ?? {})),
  saveLines: (id: string, lines: { index: number; text: string; meaning: string }[]) =>
    request<Project>(`/api/projects/${id}/lines`, json("PUT", { lines })),
  saveChoices: (id: string, choices: { index: number; text: string }[]) =>
    request<Project>(`/api/projects/${id}/choices`, json("PUT", { choices })),
  uploadGuide: (id: string, file: Blob, name = "guide.wav") => {
    const fd = new FormData();
    fd.append("file", file, name);
    return request<Project>(`/api/projects/${id}/guide`, { method: "POST", body: fd });
  },
  adapt: (req: AdaptRequest) => request<{ variants: Variant[] }>("/api/adapt", json("POST", req)),
  syllables: (text: string, lang: string, signal?: AbortSignal) =>
    request<SyllablesResult>("/api/syllables", { ...json("POST", { text, lang }), signal }),
  detectWatermark: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<WatermarkResult>("/api/watermark/detect", { method: "POST", body: fd });
  },
};

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
