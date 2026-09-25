import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = "poker-session-tracker/install-dismissed";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * "Add to home screen" nudge. Android/Chrome gets the real install prompt;
 * iPhone Safari (which has no prompt API) gets the Share → Add to Home Screen hint.
 */
export function InstallHint() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
  const mobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
  };

  if (dismissed || isStandalone() || !mobile || (!deferred && !ios)) return null;

  return (
    <div className="content-wrap mt-4 flex items-center gap-3 rounded-2xl bg-[hsl(var(--secondary))] p-3 text-sm" data-testid="install-hint">
      <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="font-bold">Put it on your home screen</div>
        <div className="text-xs text-[hsl(var(--muted-foreground))]">
          {deferred ? "Opens full-screen and works offline at the table." : <>Tap <Share size={12} className="inline -translate-y-px" /> Share, then <b>Add to Home Screen</b>.</>}
        </div>
      </div>
      {deferred ? (
        <button className="btn btn-primary !px-3 !py-2 !text-xs" onClick={async () => { await deferred.prompt(); setDeferred(null); }}><Download size={13} /> Install</button>
      ) : null}
      <button className="btn btn-ghost !p-2" onClick={dismiss} aria-label="Dismiss"><X size={14} /></button>
    </div>
  );
}
