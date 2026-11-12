import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { ReconciliationGrid, computeTotals, joinMargin, type TotalsRow } from "../components/ReconciliationGrid";
import { RemediationModal } from "../components/RemediationModal";
import { Button } from "../components/common/Button";
import { on } from "../lib/events";
import { formatDate } from "../lib/dates";
import { centsToString, formatMoney, toCents } from "../lib/money";
import type { LedgerResponse, LedgerRow, MarginResponse, RemediationResponse } from "../types/contracts";

type Tone = "brand" | "bad" | "good" | "muted";
const TILE: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  bad: "bg-bad-soft text-bad",
  good: "bg-good-soft text-good",
  muted: "bg-paper text-ink-soft",
};

function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  const pick = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? "?").slice(0, 2);
  return pick.toLocaleUpperCase();
}

/** "$1,234.50" with the cents quieter, as on a bank card. */
function Amount({ value, currency, className = "" }: { value: string | null | undefined; currency: string; className?: string }) {
  const text = formatMoney(value, currency);
  const i = text.lastIndexOf(".");
  return (
    <span className={`num ${className}`}>
      {i > 0 ? (
        <>
          {text.slice(0, i)}
          <span className="opacity-60">{text.slice(i)}</span>
        </>
      ) : (
        text
      )}
    </span>
  );
}

/**
 * The page's one bold element: what clients still owe you, on a stacked blue card.
 * Every figure comes from the same cents-based totals as the grid's pinned row.
 */
function BalanceCard({ ledger, totals }: { ledger: LedgerResponse | null; totals: TotalsRow | null }) {
  const [hidden, setHidden] = useState(false);
  const c = totals?.currency ?? "USD";
  const owed = centsToString(toCents(totals?.shortfall_amount) + toCents(totals?.penalty_amount));
  const expected = toCents(totals?.expected_amount);
  const received = toCents(totals?.captured_amount);
  const pct = expected > 0 ? Math.min(100, Math.round((100 * received) / expected)) : 0;
  const pending = ledger?.rows.filter((r) => r.discrepancy_status === "PENDING_APPROVAL").length ?? 0;
  return (
    <div className="fd-stack mt-4">
      <div className="relative overflow-hidden rounded-3xl bg-brand p-6 text-white shadow-blue sm:p-7">
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-10 h-64 w-64 rounded-full border-[28px] border-white/[0.07]" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold">Owed to you</p>
            <p className="mt-0.5 text-[13px] text-white/75">
              Short paid {hidden ? "••••" : formatMoney(totals?.shortfall_amount, c)} + penalties {hidden ? "••••" : formatMoney(totals?.penalty_amount, c)}
            </p>
          </div>
          <span className="rounded-lg bg-white px-2 py-1 text-[12px] font-bold text-brand">{c}</span>
        </div>
        <div className="relative mt-4 flex items-center gap-3">
          <p className="whitespace-nowrap text-[40px] font-bold leading-none tracking-[-0.03em] sm:text-[46px]">
            {hidden ? "••••••" : <Amount value={owed} currency={c} />}
          </p>
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            aria-label={hidden ? "Show amounts" : "Hide amounts"}
            className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
              <circle cx="12" cy="12" r="2.8" />
              {hidden && <path d="M4 4l16 16" />}
            </svg>
          </button>
        </div>
        <p className="relative mt-2 text-[13.5px] font-medium text-white/85">
          {pending
            ? pending === 1
              ? "1 correction invoice waits for your approval"
              : `${pending} correction invoices wait for your approval`
            : "Nothing waits for your approval"}
        </p>
        <div className="relative mt-6">
          <div
            className="h-2 overflow-hidden rounded-full bg-white/25"
            role="progressbar"
            aria-label="Received of what the contracts expect"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap justify-between gap-2 text-[13px] text-white/80">
            <span>
              ↙ <b className="font-semibold text-white">{pct}%</b> of what the contracts expect has arrived
            </span>
            <span>
              Expected <b className="font-semibold text-white">{hidden ? "••••" : formatMoney(totals?.expected_amount, c)}</b> ↗
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionTile({ label, to, onClick, filled, children }: { label: string; to?: string; onClick?: () => void; filled?: boolean; children: ReactNode }) {
  const tile = `flex h-16 w-16 items-center justify-center rounded-2xl transition-colors ${
    filled ? "bg-brand text-white shadow-blue group-hover:bg-brand-dark" : "bg-white text-ink shadow-card group-hover:bg-brand-soft"
  }`;
  const inner = (
    <>
      <span className={tile}>
        <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          {children}
        </svg>
      </span>
      <span className="text-[13.5px] font-semibold text-ink">{label}</span>
    </>
  );
  const cls = "group flex flex-col items-center gap-2 text-center";
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function Actions({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <nav aria-label="Quick actions" className="grid grid-cols-4 gap-2">
      <ActionTile label="Simulate" to="/simulator" filled>
        <path d="M12 5v14M5 12h14" />
      </ActionTile>
      <ActionTile label="Contract" to="/contracts/new">
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M14 3v4h4M10 13h5M10 17h3" />
      </ActionTile>
      <ActionTile label="Payroll" to="/leash/payroll">
        <path d="M3 8l9-5 9 5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" />
      </ActionTile>
      <ActionTile label={loading ? "Loading" : "Refresh"} onClick={onRefresh}>
        <path d="M20 11a8 8 0 0 0-14.6-4.4M4 4v4h4M4 13a8 8 0 0 0 14.6 4.4M20 20v-4h-4" />
      </ActionTile>
    </nav>
  );
}

/** The milestones that matter right now, as a short list: anything waiting for you first. */
function Activity({ rows, onOpen }: { rows: LedgerRow[]; onOpen: (id: string) => void }) {
  const ranked = [...rows].sort((a, b) => {
    const rank = (r: LedgerRow) => (r.discrepancy_status === "PENDING_APPROVAL" ? 0 : r.captured_at ? 1 : 2);
    return rank(a) - rank(b) || (b.captured_at ?? "").localeCompare(a.captured_at ?? "");
  });
  const list = ranked.slice(0, 4);
  return (
    <section aria-labelledby="activity-title" className="rounded-3xl bg-white p-5 shadow-card sm:p-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="activity-title" className="text-[18px] font-bold tracking-[-0.01em] text-ink">
          Recent activity
        </h2>
        <a href="#all-milestones" className="text-[14px] font-medium text-ink-muted hover:text-brand">
          See all
        </a>
      </div>
      {list.length === 0 && <p className="py-6 text-center text-[14px] text-ink-muted">No milestones yet. Activate a contract to start.</p>}
      <ul className="divide-y divide-paper-rule">
        {list.map((r) => {
          const c = r.currency;
          const owed = centsToString(toCents(r.shortfall_amount) + toCents(r.penalty_amount));
          const needsYou = r.discrepancy_status === "PENDING_APPROVAL" && r.discrepancy_id;
          const paidFull = r.captured_at && toCents(owed) === 0;
          const tone: Tone = needsYou ? "bad" : paidFull ? "good" : r.captured_at ? "brand" : "muted";
          const tag = needsYou
            ? { text: "Needs you", cls: "bg-bad-soft text-bad" }
            : r.discrepancy_status === "REMEDIATED"
              ? { text: "Invoiced", cls: "bg-brand-soft text-brand" }
              : r.discrepancy_status === "BLOCKED"
                ? { text: "Blocked", cls: "bg-warn-soft text-warn" }
                : paidFull
                  ? { text: "Paid in full", cls: "bg-good-soft text-good" }
                  : r.captured_at
                    ? null
                    : { text: "Not paid yet", cls: "bg-paper text-ink-muted" };
          const body = (
            <>
              <span aria-hidden className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[14px] font-bold ${TILE[tone]}`}>
                {initials(r.client_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-ink">{r.client_name}</span>
                <span className="block truncate text-[13px] text-ink-muted">
                  {r.milestone_code}, {r.captured_at ? `paid ${formatDate(r.captured_at)}` : `due ${formatDate(r.due_date)}`}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Amount
                  value={needsYou ? owed : r.captured_amount ?? r.expected_amount}
                  currency={c}
                  className={`text-[15px] font-bold ${needsYou ? "text-bad" : "text-ink"}`}
                />
                {tag && <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${tag.cls}`}>{tag.text}</span>}
              </span>
            </>
          );
          return (
            <li key={r.milestone_id}>
              {needsYou ? (
                <button
                  type="button"
                  onClick={() => onOpen(r.discrepancy_id as string)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-4 rounded-2xl px-2 py-3.5 text-left hover:bg-paper"
                  aria-label={`Review the correction invoice for ${r.client_name}, ${r.milestone_code}`}
                >
                  {body}
                </button>
              ) : (
                <div className="flex items-center gap-4 py-3.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SideFigures({ ledger, totals, margin }: { ledger: LedgerResponse | null; totals: TotalsRow | null; margin: MarginResponse | null }) {
  const c = totals?.currency ?? "USD";
  const items: { label: string; value: string | null | undefined; tone?: string; na?: boolean }[] = [
    { label: "Received on PayPal", value: totals?.captured_amount },
    { label: "Invoiced", value: ledger?.summary.total_remediation_invoiced ?? "0.00" },
    { label: "Paid to team", value: totals?.paid_to_team, na: !margin },
    { label: "Margin kept", value: totals?.margin, tone: "text-good" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3">
      {items.map((i) => (
        <div key={i.label} className="rounded-2xl bg-white px-4 py-3.5 shadow-card">
          <dt className="text-[13px] text-ink-muted">{i.label}</dt>
          <dd className={`num mt-0.5 text-[19px] font-bold ${i.tone ?? "text-ink"}`}>{i.na ? "Not available" : formatMoney(i.value, c)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** /ledger: the reconciliation grid, margin columns and the remediation modal at ?discrepancy=. */
export default function LedgerPage() {
  const [params, setParams] = useSearchParams();
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [margin, setMargin] = useState<MarginResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // The margin call is optional: with Leash off or failing, the grid coalesces to "0.00".
    const [l, m] = await Promise.allSettled([api.ledger(), api.margin()]);
    if (l.status === "fulfilled") {
      setLedger(l.value);
      setFailed(false);
    } else {
      setFailed(true);
    }
    setMargin(m.status === "fulfilled" ? m.value : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => on("ledger-changed", () => void load()), [load]);

  const discrepancyId = params.get("discrepancy");
  const row = useMemo(() => ledger?.rows.find((r) => r.discrepancy_id === discrepancyId) ?? null, [ledger, discrepancyId]);

  const openRemediation = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params);
      next.set("discrepancy", id);
      setParams(next);
    },
    [params, setParams],
  );

  const close = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete("discrepancy");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const onSent = useCallback((res: RemediationResponse) => {
    // Optimistic: the row turns REMEDIATED at once; a reload confirms from the server.
    setLedger((cur) =>
      cur
        ? {
            ...cur,
            rows: cur.rows.map((r) =>
              r.discrepancy_id === res.discrepancy_id
                ? { ...r, discrepancy_status: res.discrepancy_status, remediation_invoice: res.remediation_invoice, remediation_sent_by: "owner" }
                : r,
            ),
          }
        : cur,
    );
    void load();
  }, [load]);

  const totals = useMemo(() => (ledger ? computeTotals(joinMargin(ledger.rows, margin)) : null), [ledger, margin]);

  return (
    <div>
      <h1 className="sr-only">Ledger</h1>
      {failed && !ledger ? (
        <div className="rounded-lg border border-bad/30 bg-white px-6 py-10">
          <p className="font-medium text-bad">The ledger didn't load.</p>
          <p className="mt-1 text-[14px] text-ink-soft">The API isn't answering. Start the backend, then try again.</p>
          <Button className="mt-4" variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
            <section aria-label="Reconciliation summary" className="grid gap-6">
              <BalanceCard ledger={ledger} totals={totals} />
              <Actions onRefresh={() => void load()} loading={loading} />
              <SideFigures ledger={ledger} totals={totals} margin={margin} />
            </section>
            <Activity rows={ledger?.rows ?? []} onOpen={openRemediation} />
          </div>
          <section id="all-milestones" aria-labelledby="all-title" className="mt-10 scroll-mt-6">
            <div className="mb-4">
              <h2 id="all-title" className="text-[20px] font-bold tracking-[-0.01em] text-ink">
                All milestones
              </h2>
              <p className="mt-1 text-[14px] text-ink-soft">
                What each contract says you should have been paid, what arrived through PayPal, and what went out to your team.
              </p>
            </div>
            <ReconciliationGrid rows={ledger?.rows ?? []} margin={margin} loading={loading && !ledger} onOpenRemediation={openRemediation} />
          </section>
        </>
      )}

      <RemediationModal row={row} open={Boolean(discrepancyId) && Boolean(ledger)} onClose={close} onSent={onSent} onStale={() => void load()} />
    </div>
  );
}
