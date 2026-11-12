import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ToastProvider } from "./components/common/Toast";
import { UnlockDialog, useUnlockRequired } from "./components/common/UnlockDialog";
import { api, apiConfig } from "./api/client";
import { getDemoKey } from "./api/demoKey";
import { on } from "./lib/events";
import type { HealthResponse } from "./types/contracts";
import ContractsPage from "./pages/ContractsPage";
import ContractWorkbenchPage from "./pages/ContractWorkbenchPage";
import SimulatorPage from "./pages/SimulatorPage";
import LedgerPage from "./pages/LedgerPage";
import { DecisionsPage, PayrollPage, PayrollRunPage, RulesPage, TeamPage } from "./components/Leash";
import NotFound from "./pages/NotFound";

const DETECTIVE_NAV = [
  { to: "/ledger", label: "Ledger" },
  { to: "/contracts", label: "Contracts" },
  { to: "/simulator", label: "Simulator" },
];
const LEASH_NAV = [
  { to: "/leash/rules", label: "Rules" },
  { to: "/leash/team", label: "Team" },
  { to: "/leash/payroll", label: "Payroll" },
  { to: "/leash/decisions", label: "Decisions" },
];

/* Line icons for the phone tab bar, drawn in currentColor. */
const ICONS: Record<string, ReactNode> = {
  home: <path d="M4 11l8-6 8 6v8h-5v-5H9v5H4z" />,
  contract: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </>
  ),
  pay: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  leash: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
};
function Icon({ name, className = "h-[22px] w-[22px]" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

function PillNav({ label, items }: { label: string; items: { to: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          className={({ isActive }) =>
            `whitespace-nowrap rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors ${
              isActive ? "bg-brand text-white" : "text-ink-soft hover:bg-paper hover:text-ink"
            }`
          }
        >
          {i.label}
        </NavLink>
      ))}
    </div>
  );
}

function SandboxBadge({ health }: { health: HealthResponse | null | "down" }) {
  const base = "flex h-10 min-w-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white px-3 text-[13px] font-medium shadow-card sm:px-3.5";
  const dot = (c: string) => <span aria-hidden className={`h-2 w-2 rounded-full ${c}`} />;
  if (apiConfig.useMocks) {
    return (
      <span className={`${base} text-warn`} title="Serving shared/fixtures; no backend or PayPal calls">
        {dot("bg-warn")}
        <span className="hidden sm:inline">Sample data</span>
      </span>
    );
  }
  if (health === null) return <span className={`${base} text-ink-muted`}>Connecting…</span>;
  if (health === "down") return <span className={`${base} text-bad`}>{dot("bg-bad")}API offline</span>;
  const ok = health.paypal_sandbox_connected;
  return (
    <span className={`${base} ${ok ? "text-good" : "text-warn"}`} title={health.ai_provider ? `AI: ${health.ai_provider}` : undefined}>
      {dot(ok ? "bg-good" : "bg-warn")}
      <span className="hidden sm:inline">{ok ? "PayPal sandbox" : "Sandbox not connected"}</span>
    </span>
  );
}

function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/* Phones: Leash has four pages, so they get their own pill row under the header. */
function LeashSubNav() {
  const { pathname } = useLocation();
  if (!pathname.startsWith("/leash")) return null;
  return (
    <nav aria-label="Leash" className="-mx-4 mb-5 overflow-x-auto px-4 md:hidden">
      <div className="flex w-max gap-1 rounded-full bg-white p-1 shadow-card">
        <PillNav label="Leash pages" items={LEASH_NAV} />
      </div>
    </nav>
  );
}

function TabBar() {
  const tabs = [
    { to: "/ledger", label: "Home", icon: "home", match: (p: string) => p === "/" || p.startsWith("/ledger") },
    { to: "/contracts", label: "Contracts", icon: "contract", match: (p: string) => p.startsWith("/contracts") },
    { to: "/simulator", label: "Pay", icon: "pay", match: (p: string) => p.startsWith("/simulator") },
    { to: "/leash/payroll", label: "Leash", icon: "leash", match: (p: string) => p.startsWith("/leash") },
  ];
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-4 bottom-[calc(12px+env(safe-area-inset-bottom))] z-40 flex rounded-full bg-white p-1.5 shadow-float md:hidden"
    >
      {tabs.map((t) => {
        const on = t.match(pathname);
        return (
          <NavLink
            key={t.to}
            to={t.to}
            aria-current={on ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-[14px] font-semibold transition-colors ${
              on ? "bg-brand text-white" : "text-ink-muted"
            }`}
          >
            <Icon name={t.icon} />
            <span className={on ? "" : "sr-only"}>{t.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function App() {
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(Boolean(getDemoKey()));
  const [health, setHealth] = useState<HealthResponse | null | "down">(null);
  const openUnlock = useCallback(() => setUnlockOpen(true), []);
  useUnlockRequired(openUnlock);

  useEffect(() => on("demo-key-changed", setUnlocked), []);
  useEffect(() => {
    let alive = true;
    api
      .health()
      .then((h) => alive && setHealth(h))
      .catch(() => alive && setHealth("down"));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <ToastProvider>
      <div className="min-h-screen pb-28 md:pb-0">
        <header className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 pb-2 pt-5 sm:px-6 md:pt-6">
          <NavLink to="/ledger" className="flex min-w-0 items-center gap-3 text-ink md:shrink-0">
            <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-[15px] font-bold text-brand">
              FD
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-[13px] text-ink-muted">{greeting()}</span>
              <span className="block truncate text-[17px] font-bold tracking-[-0.01em] sm:text-[18px]">Financial Detective</span>
            </span>
          </NavLink>

          <nav aria-label="Main" className="mx-auto hidden items-center gap-2 rounded-full bg-white p-1 shadow-card md:flex">
            <PillNav label="Detective" items={DETECTIVE_NAV} />
            <span aria-hidden className="h-5 w-px bg-paper-line" />
            <PillNav label="Leash" items={LEASH_NAV} />
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
            <SandboxBadge health={health} />
            <button
              type="button"
              onClick={openUnlock}
              aria-label={unlocked ? "Owner unlocked" : "Unlock"}
              className={`flex h-10 min-w-10 items-center justify-center gap-2 rounded-full px-3 text-[13px] font-semibold shadow-card sm:px-3.5 transition-colors ${
                unlocked ? "bg-white text-ink-soft hover:text-ink" : "bg-brand text-white hover:bg-brand-dark"
              }`}
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="10" rx="2.5" />
                <path d={unlocked ? "M8 11V8a4 4 0 0 1 7.5-2" : "M8 11V8a4 4 0 0 1 8 0v3"} />
              </svg>
              {unlocked ? <span className="hidden sm:inline">Owner unlocked</span> : <span className="hidden sm:inline">Unlock</span>}
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-7">
          <LeashSubNav />
          <Routes>
            <Route path="/" element={<Navigate to="/ledger" replace />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/contracts/new" element={<ContractWorkbenchPage />} />
            <Route path="/contracts/:contractId" element={<ContractWorkbenchPage />} />
            <Route path="/simulator" element={<SimulatorPage />} />
            <Route path="/ledger" element={<LedgerPage />} />
            <Route path="/leash/rules" element={<RulesPage />} />
            <Route path="/leash/team" element={<TeamPage />} />
            <Route path="/leash/payroll" element={<PayrollPage />} />
            <Route path="/leash/payroll/:runId" element={<PayrollRunPage />} />
            <Route path="/leash/decisions" element={<DecisionsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <TabBar />
      </div>
      <UnlockDialog open={unlockOpen} onClose={() => setUnlockOpen(false)} />
    </ToastProvider>
  );
}
