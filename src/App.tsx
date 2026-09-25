import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BarChart3, Check, Hand, History, Monitor, Moon, Sun, Undo2 } from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { ConfirmModal } from "./components/bits";
import { InstallHint } from "./components/InstallHint";
import { ReconcileBar } from "./components/Settlement";
import { hostTotal, inr, reconcile, uid, SCHEMA_VERSION, type Session, type SessionSetup } from "./poker";
import { exportBackup, mergeSessions, parseBackup, useSessions, useTheme } from "./storage";
import { HistoryView } from "./views/HistoryView";
import { LiveTable } from "./views/LiveTable";
import { StartView } from "./views/StartView";
import { StatsView } from "./views/StatsView";

type View = "table" | "history" | "stats";
type ToastState = { id: number; message: string; undo?: () => void } | null;
type ConfirmState = { title: string; body: ReactNode; confirmLabel: string; danger?: boolean; extra?: ReactNode; onConfirm: () => void } | null;

function App() {
  return (
    <ErrorBoundary>
      <Home />
    </ErrorBoundary>
  );
}

function Home() {
  const { sessions, setSessions, saveError } = useSessions();
  const { theme, cycle } = useTheme();
  const [view, setView] = useState<View>("table");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const activeSession = sessions.find((s) => !s.endedAt) ?? null;
  const pastSessions = sessions.filter((s) => s.endedAt).sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
  const selectedSession = pastSessions.find((s) => s.id === selectedSessionId) ?? null;

  useEffect(() => { window.scrollTo({ top: 0 }); }, [view, selectedSessionId]);

  // Warn before closing the tab mid-session if saving has failed.
  useEffect(() => {
    if (!saveError || !activeSession) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveError, activeSession]);

  const updateSession = useCallback((id: string, updater: (s: Session) => Session) => {
    setSessions((current) => current.map((s) => (s.id === id ? updater(s) : s)));
  }, [setSessions]);

  const showToast = useCallback((message: string, undo?: () => void) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), undo ? 6000 : 2600);
  }, []);

  const startSession = (date: string, names: string[], setup: SessionSetup) => {
    if (activeSession) return;
    const now = new Date();
    const [y, m, d] = date.split("-").map(Number);
    const started = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
    const session: Session = {
      id: uid("session"),
      version: SCHEMA_VERSION,
      startedAt: started.toISOString(),
      endedAt: null,
      ...setup,
      chipSet: pastSessions[0]?.chipSet ?? null,
      hands: [],
      players: names.map((name) => ({ id: uid("player"), name: name.trim(), buyIns: setup.defaultBuyIn ? [setup.defaultBuyIn] : [], cashOut: null, sittingOut: false })),
    };
    setSessions((current) => [session, ...current]);
    setView("table");
    showToast(setup.defaultBuyIn ? `Session started · everyone in for ${inr(setup.defaultBuyIn)}.` : "Session started. Deal the first hand.");
  };

  const requestFinish = () => {
    if (!activeSession) return;
    const rec = reconcile(activeSession);
    const problems: string[] = [];
    if (rec.unsettled.length) problems.push(`${rec.unsettled.map((p) => p.name).join(", ")} ${rec.unsettled.length === 1 ? "has" : "have"} no cash-out yet.`);
    else if (rec.difference !== 0) problems.push(`The chips are off by ${inr(Math.abs(rec.difference))}.`);
    setConfirm({
      title: "Finish this session?",
      body: problems.length ? <>{problems.join(" ")} You can still finish and fix it later with Reopen.</> : <>Everything adds up. {activeSession.hands.length} hands, {inr(hostTotal(activeSession))} in house fees.</>,
      extra: <div className="mt-4"><ReconcileBar session={activeSession} /></div>,
      confirmLabel: "Finish session",
      onConfirm: () => {
        updateSession(activeSession.id, (s) => ({ ...s, endedAt: new Date().toISOString() }));
        setConfirm(null);
        setSelectedSessionId(activeSession.id);
        setView("history");
        showToast("Session finished and saved.");
      },
    });
  };

  const deleteSession = (session: Session) => {
    setConfirm({
      title: "Delete this session?",
      body: `The ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(session.startedAt))} session and all ${session.hands.length} hands will be removed from this device.`,
      confirmLabel: "Delete session",
      danger: true,
      onConfirm: () => {
        setSessions((current) => current.filter((s) => s.id !== session.id));
        setSelectedSessionId(null);
        setConfirm(null);
        showToast("Session deleted.", () => setSessions((current) => [...current, session]));
      },
    });
  };

  const reopenSession = (session: Session) => {
    if (activeSession) return;
    updateSession(session.id, (s) => ({ ...s, endedAt: null }));
    setSelectedSessionId(null);
    setView("table");
    showToast("Session reopened.");
  };

  const importFile = async (file: File) => {
    try {
      const incoming = await parseBackup(file);
      setSessions((current) => mergeSessions(current, incoming));
      showToast(`Imported ${incoming.length} session${incoming.length === 1 ? "" : "s"}.`);
    } catch (e) {
      showToast(e instanceof Error ? `Import failed: ${e.message}` : "Import failed.");
    }
  };

  const nav = (target: View) => { setView(target); setSelectedSessionId(null); };
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="content-wrap flex h-[64px] items-center justify-between gap-3 sm:h-[72px]">
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => nav("table")} data-testid="button-brand-home">
            <span className="brand-mark" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold tracking-[-0.02em]">The House Cut</span>
              <span className="eyebrow mt-0.5 hidden sm:block">Home game ledger</span>
            </span>
          </button>
          <div className="flex items-center gap-1.5">
            <nav className="flex items-center gap-1 rounded-xl bg-[hsl(var(--secondary)/.72)] p-1" aria-label="Main">
              <NavButton active={view === "table"} onClick={() => nav("table")} icon={<Hand size={14} />} label={activeSession ? "Live" : "Start"} dot={Boolean(activeSession)} testId="button-nav-table" />
              <NavButton active={view === "history"} onClick={() => nav("history")} icon={<History size={14} />} label="History" testId="button-nav-history" />
              <NavButton active={view === "stats"} onClick={() => nav("stats")} icon={<BarChart3 size={14} />} label="Stats" testId="button-nav-stats" />
            </nav>
            <button className="btn btn-ghost !p-2.5" onClick={cycle} aria-label={`Theme: ${theme}. Change theme`} title={`Theme: ${theme}`} data-testid="button-theme"><ThemeIcon size={16} /></button>
          </div>
        </div>
      </header>

      <InstallHint />

      {saveError ? (
        <div className="content-wrap mt-4 flex items-start gap-2 rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm text-[hsl(var(--destructive))]" role="alert">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{saveError}</span>
          <button className="btn btn-danger ml-auto !py-1 !text-xs" onClick={() => exportBackup(sessions)}>Export</button>
        </div>
      ) : null}

      <main className="content-wrap pb-24 pt-8 sm:pt-12">
        {view === "table" ? (
          activeSession ? (
            <LiveTable session={activeSession} onUpdate={updateSession} onFinish={requestFinish} onToast={showToast} />
          ) : (
            <StartView
              activeSession={null}
              pastSessions={pastSessions}
              onStart={startSession}
              onResume={() => setView("table")}
              onHistory={() => nav("history")}
              onSelectPast={(s) => { setSelectedSessionId(s.id); setView("history"); }}
            />
          )
        ) : view === "history" ? (
          <HistoryView
            sessions={pastSessions}
            selectedSession={selectedSession}
            canReopen={!activeSession}
            onSelect={(s) => setSelectedSessionId(s.id)}
            onBack={() => setSelectedSessionId(null)}
            onDelete={deleteSession}
            onReopen={reopenSession}
            onExport={() => exportBackup(sessions)}
            onImport={importFile}
          />
        ) : (
          <StatsView sessions={sessions} />
        )}
      </main>

      <footer className="content-wrap flex flex-col justify-between gap-2 border-t border-[hsl(var(--border))] py-7 text-xs text-[hsl(var(--muted-foreground))] sm:flex-row">
        <span className="mono-font">SAVED IN THIS BROWSER · EXPORT TO BACK UP</span>
        <span>For tracking home games between friends.</span>
      </footer>

      {toast ? (
        <div key={toast.id} className="toast-note flex items-center gap-3" role="status" data-testid="status-toast">
          <Check size={15} className="shrink-0 text-[hsl(var(--accent))]" />
          <span>{toast.message}</span>
          {toast.undo ? (
            <button className="btn btn-soft !border-0 !px-2 !py-1 !text-xs" onClick={() => { toast.undo?.(); setToast(null); }} data-testid="button-undo-action"><Undo2 size={13} /> Undo</button>
          ) : null}
        </div>
      ) : null}

      {confirm ? (
        <ConfirmModal title={confirm.title} body={confirm.body} confirmLabel={confirm.confirmLabel} danger={confirm.danger} onCancel={() => setConfirm(null)} onConfirm={confirm.onConfirm}>
          {confirm.extra}
        </ConfirmModal>
      ) : null}
    </div>
  );
}

function NavButton({ active, onClick, icon, label, dot, testId }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; dot?: boolean; testId: string }) {
  return (
    <button className={`btn relative ${active ? "btn-primary" : "btn-ghost"} !px-3 !py-2`} onClick={onClick} aria-current={active ? "page" : undefined} aria-label={label} data-testid={testId}>
      {icon} <span className="hidden sm:inline">{label}</span>
      {dot ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" aria-hidden="true" /> : null}
    </button>
  );
}

export default App;
