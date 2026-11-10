import { useEffect, useState } from "react";
import { NavLink, Outlet, Route, Routes, Link } from "react-router-dom";
import { onBackendStatus } from "./api";
import { useHealth, useOffline } from "./health";
import { ModeBadge } from "./components/StatusBadge";
import { IconAlert, IconLogout } from "./components/icons";
import Home from "./pages/Home";
import Studio from "./pages/Studio";
import Atelier from "./pages/Atelier";
import Verifier from "./pages/Verifier";
import type { Health } from "./types";

export interface LayoutCtx { health: Health | null }

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3" aria-label="PolyglotSound, accueil">
      <img
        src="/logopolyglot.png"
        alt=""
        width={48}
        height={48}
        className="h-12 w-12 rounded-[14px] object-cover shadow-[var(--raise-sm)] ring-1 ring-white/50"
      />
      <span className="flex flex-col leading-none">
        <span className="font-display text-base font-extrabold tracking-tight">PolyglotSound</span>
        <span className="mt-1 font-serif text-sm italic text-brand-soft">Studio d'adaptation</span>
      </span>
    </Link>
  );
}

function Layout() {
  const health = useHealth();
  const [down, setDown] = useState(false);
  useEffect(() => onBackendStatus(setDown), []);
  const offline = useOffline();
  const nav = ({ isActive }: { isActive: boolean }) =>
    `rounded-[11px] px-3.5 py-2 text-sm font-semibold transition ${isActive
      ? "neo-chip text-brand-soft"
      : "text-muted hover:text-ink"}`;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-halos" aria-hidden="true"><span /></div>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 btn btn-primary">Aller au contenu</a>
      {down && !offline && (
        <div role="alert" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-flame-soft px-4 py-2 text-sm font-semibold text-white">
          <IconAlert size={16} /> Backend injoignable · <code className="rounded bg-black/15 px-1.5 py-0.5">backend/run.sh</code>
        </div>
      )}
      <header className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-5 md:px-8">
        <Logo />
        <nav aria-label="Navigation principale" className="neo-inset flex flex-wrap items-center gap-1 rounded-2xl p-1.5">
          <NavLink to="/" end className={nav}>Accueil</NavLink>
          <NavLink to="/projet/nouveau" className={nav}>Studio</NavLink>
          <NavLink to="/atelier" className={nav}>Atelier jury</NavLink>
          <NavLink to="/verifier" className={nav}>Filigrane</NavLink>
        </nav>
        {offline ? (
          <span
            className="inline-flex items-center gap-2 rounded-[9px] px-3 py-1 text-xs font-semibold text-gold-soft shadow-[var(--inset-sm)]"
            title="Backend hors ligne : projets enregistrés consultables en lecture seule"
          >
            <span className="h-2 w-2 rounded-full bg-gold" aria-hidden="true" />
            Mode démo hors ligne
          </span>
        ) : (
          <ModeBadge mode={health?.mode} provider={health?.llm?.provider} compact />
        )}
      </header>
      <main id="contenu" className="mx-auto w-full max-w-[1500px] flex-1 px-5 pb-16 md:px-8">
        <Outlet context={{ health } satisfies LayoutCtx} />
      </main>
      <footer className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center gap-2 border-t border-ink/10 px-5 py-6 text-xs text-muted md:px-8">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
        PolyglotSound · Hackathon IA &amp; Musique 2026 · <span className="text-muted">Team BLACKYY</span>
        <span className="ml-auto text-muted">SIMA × Epitech Bénin</span>
        <a href="/auth/logout" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted underline-offset-2 transition hover:text-ink hover:underline">
          <IconLogout size={12} /> Se déconnecter
        </a>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="projet/:id" element={<Studio />} />
        <Route path="atelier" element={<Atelier />} />
        <Route path="verifier" element={<Verifier />} />
        <Route path="*" element={<div className="glass p-8 text-center"><h1 className="font-display text-2xl font-extrabold">Page introuvable</h1><Link to="/" className="btn btn-primary mt-4">Retour à l'accueil</Link></div>} />
      </Route>
    </Routes>
  );
}
