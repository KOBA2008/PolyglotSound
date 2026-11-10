/**
 * Vercel Routing Middleware : protège tout le site (pages, /offline/*, audio, /api)
 * derrière un mot de passe partagé, vérifié côté serveur.
 *
 * - SITE_PASSWORD (variable d'environnement Vercel) : mot de passe attendu.
 *   Non défini => tout passe (développement local).
 * - POST /auth/login (formulaire, champ "password", champ optionnel "next")
 * - GET  /auth/logout
 * - Cookie HttpOnly / Secure / SameSite=Lax, 7 jours, valeur = HMAC-SHA256(SITE_PASSWORD, constante).
 *   Changer SITE_PASSWORD invalide donc toutes les sessions.
 */
import { next } from "@vercel/functions/middleware";

export const config = {
  // Exclut la page de connexion et ses ressources (le code ci-dessous les autorise aussi).
  matcher: ["/((?!login\\.html|logopolyglot\\.png|favicon\\.svg).*)"],
};

export const COOKIE = "ps_session";
const MAX_AGE = 60 * 60 * 24 * 7;
const SESSION_MSG = "polyglotsound/session/v1";
const PUBLIC_PATHS = new Set(["/login.html", "/logopolyglot.png", "/favicon.svg"]);

const enc = new TextEncoder();

async function hmac(key: string, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** Comparaison à temps constant de deux chaînes (via leurs empreintes HMAC de même longueur). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const k = hex(key);
  const [x, y] = await Promise.all([hmac(k, a), hmac(k, b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function sessionToken(password: string): Promise<string> {
  return hex(await hmac(password, SESSION_MSG));
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** N'accepte que des chemins internes ("/x"), jamais "//hote" ni une URL absolue. */
function safeNext(v: unknown): string {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return "/";
  if (v.startsWith("/auth/") || v.startsWith("/login.html")) return "/";
  return v;
}

function redirect(to: string, req: Request, cookie?: string): Response {
  const headers = new Headers({ Location: new URL(to, req.url).toString(), "Cache-Control": "no-store" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function sessionCookie(value: string, maxAge: number): string {
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function loginUrl(nextPath: string, error = false): string {
  const p = new URLSearchParams();
  if (error) p.set("e", "1");
  if (nextPath !== "/") p.set("next", nextPath);
  const q = p.toString();
  return `/login.html${q ? `?${q}` : ""}`;
}

export default async function middleware(request: Request): Promise<Response> {
  const password = process.env.SITE_PASSWORD;
  if (!password) return next(); // pas de mot de passe configuré : site ouvert (dev local)

  const url = new URL(request.url);
  const path = url.pathname;

  if (PUBLIC_PATHS.has(path)) return next();

  if (path === "/auth/logout") {
    return redirect("/login.html", request, sessionCookie("", 0));
  }

  if (path === "/auth/login") {
    if (request.method !== "POST") return redirect("/login.html", request);
    let given = "";
    let nextPath = "/";
    try {
      const form = await request.formData();
      given = String(form.get("password") ?? "");
      nextPath = safeNext(form.get("next"));
    } catch {
      /* corps invalide : traité comme un mauvais mot de passe */
    }
    if (given && (await safeEqual(given, password))) {
      return redirect(nextPath, request, sessionCookie(await sessionToken(password), MAX_AGE));
    }
    return redirect(loginUrl(nextPath, true), request);
  }

  const cookie = readCookie(request, COOKIE);
  if (cookie && (await safeEqual(cookie, await sessionToken(password)))) return next();

  // Non authentifié : navigation => page de connexion ; ressources (audio, JSON, API) => 401.
  const accept = request.headers.get("accept") ?? "";
  const isPage = request.method === "GET" && (accept.includes("text/html") || request.headers.get("sec-fetch-mode") === "navigate");
  if (isPage) return redirect(loginUrl(safeNext(path + url.search)), request);
  return new Response("Authentification requise.", {
    status: 401,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
