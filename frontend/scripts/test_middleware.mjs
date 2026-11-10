// Tests du middleware d'authentification (Node >= 22.18, suppression native des types TS).
// Usage : node scripts/test_middleware.mjs   (depuis frontend/)
import assert from "node:assert/strict";

const { default: middleware, sessionToken, COOKIE } = await import("../middleware.ts");

const BASE = "https://polyglotsound.vercel.app";
const PASS = "test-" + Math.random().toString(36).slice(2);
const html = { accept: "text/html,application/xhtml+xml" };
const isNext = (r) => r.headers.get("x-middleware-next") === "1";
const loc = (r) => r.headers.get("location");
const form = (fields) => new Request(BASE + "/auth/login", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

let n = 0;
async function t(name, fn) { await fn(); n++; console.log("ok -", name); }

// 1. Sans SITE_PASSWORD : tout passe
delete process.env.SITE_PASSWORD;
await t("sans mot de passe configuré, tout passe", async () => {
  assert.ok(isNext(await middleware(new Request(BASE + "/", { headers: html }))));
  assert.ok(isNext(await middleware(new Request(BASE + "/offline/79f842/final.mp3"))));
});

process.env.SITE_PASSWORD = PASS;

await t("page sans cookie -> redirection vers /login.html (avec next)", async () => {
  const r = await middleware(new Request(BASE + "/projet/79f842?etape=6", { headers: html }));
  assert.equal(r.status, 303);
  const u = new URL(loc(r));
  assert.equal(u.pathname, "/login.html");
  assert.equal(u.searchParams.get("next"), "/projet/79f842?etape=6");
});

await t("racine sans cookie -> /login.html", async () => {
  const r = await middleware(new Request(BASE + "/", { headers: html }));
  assert.equal(new URL(loc(r)).pathname + new URL(loc(r)).search, "/login.html");
});

await t("audio / JSON hors ligne sans cookie -> 401", async () => {
  assert.equal((await middleware(new Request(BASE + "/offline/79f842/final.mp3"))).status, 401);
  assert.equal((await middleware(new Request(BASE + "/offline/projects.json", { headers: { accept: "*/*" } }))).status, 401);
  assert.equal((await middleware(new Request(BASE + "/api/health"))).status, 401);
});

await t("page de connexion et logo accessibles", async () => {
  assert.ok(isNext(await middleware(new Request(BASE + "/login.html?e=1", { headers: html }))));
  assert.ok(isNext(await middleware(new Request(BASE + "/logopolyglot.png"))));
});

await t("mauvais mot de passe -> /login.html?e=1, pas de cookie", async () => {
  const r = await middleware(form({ password: "faux", next: "/atelier" }));
  assert.equal(r.status, 303);
  const u = new URL(loc(r));
  assert.equal(u.pathname, "/login.html");
  assert.equal(u.searchParams.get("e"), "1");
  assert.equal(u.searchParams.get("next"), "/atelier");
  assert.equal(r.headers.get("set-cookie"), null);
});

await t("mot de passe vide -> erreur", async () => {
  const r = await middleware(form({ password: "" }));
  assert.equal(new URL(loc(r)).searchParams.get("e"), "1");
});

let cookie;
await t("bon mot de passe -> cookie HttpOnly/Secure/SameSite=Lax 7 j + redirection next", async () => {
  const r = await middleware(form({ password: PASS, next: "/projet/79f842" }));
  assert.equal(r.status, 303);
  assert.equal(new URL(loc(r)).pathname, "/projet/79f842");
  const sc = r.headers.get("set-cookie");
  assert.match(sc, new RegExp(`^${COOKIE}=[0-9a-f]{64};`));
  for (const attr of ["HttpOnly", "Secure", "SameSite=Lax", "Max-Age=604800", "Path=/"]) assert.ok(sc.includes(attr), attr);
  cookie = sc.split(";")[0];
  assert.equal(cookie, `${COOKIE}=${await sessionToken(PASS)}`);
  assert.ok(!sc.includes(PASS), "le mot de passe ne doit pas apparaître dans le cookie");
});

await t("redirection ouverte refusée (next=//evil.com)", async () => {
  const r = await middleware(form({ password: PASS, next: "//evil.com/x" }));
  assert.equal(new URL(loc(r)).origin, BASE);
  assert.equal(new URL(loc(r)).pathname, "/");
  const r2 = await middleware(form({ password: PASS, next: "https://evil.com" }));
  assert.equal(new URL(loc(r2)).origin, BASE);
});

await t("avec cookie valide : pages, audio et JSON passent", async () => {
  for (const p of ["/", "/projet/79f842", "/offline/projects.json", "/offline/79f842/final.mp3"]) {
    assert.ok(isNext(await middleware(new Request(BASE + p, { headers: { cookie: `autre=1; ${cookie}` } }))), p);
  }
});

await t("cookie falsifié ou ancien mot de passe refusé", async () => {
  const bad = `${COOKIE}=${"0".repeat(64)}`;
  assert.equal((await middleware(new Request(BASE + "/offline/projects.json", { headers: { cookie: bad } }))).status, 401);
  const old = `${COOKIE}=${await sessionToken("ancien")}`;
  assert.equal((await middleware(new Request(BASE + "/", { headers: { ...html, cookie: old } }))).status, 303);
});

await t("GET /auth/login -> /login.html", async () => {
  const r = await middleware(new Request(BASE + "/auth/login", { headers: html }));
  assert.equal(new URL(loc(r)).pathname, "/login.html");
});

await t("/auth/logout efface le cookie", async () => {
  const r = await middleware(new Request(BASE + "/auth/logout", { headers: { ...html, cookie } }));
  assert.equal(r.status, 303);
  assert.equal(new URL(loc(r)).pathname, "/login.html");
  assert.match(r.headers.get("set-cookie"), new RegExp(`^${COOKIE}=; .*Max-Age=0`));
});

console.log(`\n${n} tests OK`);
