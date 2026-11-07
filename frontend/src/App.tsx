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
    <Link to="/" className="flex items-center gap-2.5" aria-label="PolyglotSound, accueil">
      <svg width="38" height="38" viewBox="0 0 40 40" aria-hidden="true">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8cffc1" />
            <stop offset=".45" stopColor="#00d084" />
            <stop offset="1" stopColor="#ffd700" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="38" height="38" rx="12" fill="#101624" stroke="rgba(255,255,255,.09)" />
        <rect x="3.5" y="3.5" width="33" height="33" rx="9.5" fill="none" stroke="rgba(255,255,255,.04)" />
        <g fill="url(#lg)">
          <rect x="8" y="17" width="4" height="8" rx="2" />
          <rect x="14" y="12" width="4" height="18" rx="2" />
          <rect x="20" y="7" width="4" height="28" rx="2" />
          <rect x="26" y="14" width="4" height="14" rx="2" />
        </g>
        <circle cx="31.5" cy="9" r="2.4" fill="#ff3b30" />
      </svg>
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
      ? "bg-brand/12 text-brand-soft ring-1 ring-brand/30 shadow-[inset_2px_2px_6px_rgba(1,4,10,.55)]"
      : "text-muted hover:text-ink"}`;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-halos" aria-hidden="true"><span /></div>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 btn btn-primary">Aller au contenu</a>
      {down && (
        <div role="alert" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-flame/90 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
          <IconAlert size={16} /> Backend injoignable, lancez <code className="rounded bg-night/60 px-1.5 py-0.5">backend/run.sh</code>
        </div>
      )}
      <header className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-4 md:px-8">
        <Logo />
        <nav aria-label="Navigation principale" className="flex flex-wrap items-center gap-1">
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
      <footer className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center gap-2 border-t border-white/5 px-5 py-6 text-xs text-muted/80 md:px-8">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
        PolyglotSound · Hackathon IA &amp; Musique 2026 · SIMA × Epitech Bénin · <span className="text-muted">Team BLACKYY</span>
        <span className="ml-auto flex items-center gap-1.5 text-muted/70">
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
