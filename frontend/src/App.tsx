import { useEffect, useState } from "react";
import { NavLink, Outlet, Route, Routes, Link } from "react-router-dom";
import { onBackendStatus } from "./api";
import { useHealth } from "./health";
import { ModeBadge } from "./components/StatusBadge";
import { IconAlert } from "./components/icons";
import Home from "./pages/Home";
import Studio from "./pages/Studio";
import Atelier from "./pages/Atelier";
import Verifier from "./pages/Verifier";
import type { Health } from "./types";

export interface LayoutCtx { health: Health | null }

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3" aria-label="PolyglotSound, accueil">
      <span className="neo-chip flex h-11 w-11 items-center justify-center rounded-2xl">
        <svg width="24" height="24" viewBox="0 0 28 28" aria-hidden="true">
          <defs>
            <linearGradient id="lg" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#007a56" />
              <stop offset=".65" stopColor="#00b981" />
              <stop offset="1" stopColor="#a86f00" />
            </linearGradient>
          </defs>
          <g fill="url(#lg)">
            <rect x="3" y="11" width="3.4" height="6" rx="1.7" />
            <rect x="9" y="7" width="3.4" height="14" rx="1.7" />
            <rect x="15" y="3" width="3.4" height="22" rx="1.7" />
            <rect x="21" y="9" width="3.4" height="10" rx="1.7" />
          </g>
          <circle cx="24.5" cy="4.5" r="2" fill="#cf2e22" />
        </svg>
      </span>
      <span className="font-display text-lg font-extrabold tracking-tight">Polyglot<span className="grad-text">Sound</span></span>
    </Link>
  );
}

function Layout() {
  const health = useHealth();
  const [down, setDown] = useState(false);
  useEffect(() => onBackendStatus(setDown), []);
  const nav = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${isActive
      ? "neo-chip text-brand-soft"
      : "text-muted hover:text-ink"}`;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-halos" aria-hidden="true"><span /></div>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 btn btn-primary">Aller au contenu</a>
      {down && (
        <div role="alert" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-flame px-4 py-2 text-sm font-semibold text-white">
          <IconAlert size={16} /> Backend injoignable, lancez <code className="rounded bg-black/15 px-1.5 py-0.5">backend/run.sh</code>
        </div>
      )}
      <header className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-5 md:px-8">
        <Logo />
        <nav aria-label="Navigation principale" className="neo-inset flex flex-wrap items-center gap-1 rounded-full p-1">
          <NavLink to="/" end className={nav}>Accueil</NavLink>
          <NavLink to="/projet/nouveau" className={nav}>Studio</NavLink>
          <NavLink to="/atelier" className={nav}>Atelier jury</NavLink>
          <NavLink to="/verifier" className={nav}>Vérifier un filigrane</NavLink>
        </nav>
        <ModeBadge mode={health?.mode} provider={health?.llm?.provider} compact />
      </header>
      <main id="contenu" className="mx-auto w-full max-w-[1500px] flex-1 px-5 pb-16 md:px-8">
        <Outlet context={{ health } satisfies LayoutCtx} />
      </main>
      <footer className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center gap-2 border-t border-ink/10 px-5 py-6 text-xs text-muted md:px-8">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
        PolyglotSound · Hackathon IA &amp; Musique 2026 · SIMA × Epitech Bénin · <span className="text-muted">Team BLACKYY</span>
        <span className="ml-auto flex items-center gap-1.5 text-muted">
          <span className="h-1 w-1 rounded-full bg-gold" aria-hidden="true" />
          <span className="h-1 w-1 rounded-full bg-flame" aria-hidden="true" />
          Tradition · Innovation · Impact
        </span>
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
