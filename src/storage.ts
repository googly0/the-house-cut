import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeSessions, type Session } from "./poker";

export const STORAGE_KEY = "poker-session-tracker/sessions";
const THEME_KEY = "poker-session-tracker/theme";

function read(): Session[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeSessions(JSON.parse(stored)) : [];
  } catch {
    return [];
  }
}

/**
 * Sessions live in localStorage. Writes are guarded (quota / private mode),
 * and other open tabs are kept in sync via the `storage` event so two tabs
 * can't silently overwrite each other.
 */
export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>(read);
  const [saveError, setSaveError] = useState<string | null>(null);
  const skipNextWrite = useRef(false);

  useEffect(() => {
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      setSaveError(null);
    } catch {
      setSaveError("This browser refused to save. Export a backup now so you don't lose tonight's data.");
    }
  }, [sessions]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      skipNextWrite.current = true;
      setSessions(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { sessions, setSessions, saveError };
}

export function exportBackup(sessions: Session[]) {
  const blob = new Blob([JSON.stringify({ app: "the-house-cut", exportedAt: new Date().toISOString(), sessions }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `house-cut-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function parseBackup(file: File): Promise<Session[]> {
  const text = await file.text();
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data?.sessions;
  const sessions = normalizeSessions(list);
  if (!sessions.length) throw new Error("No sessions found in that file.");
  return sessions;
}

/** Merge imported sessions by id; imported copies win. */
export function mergeSessions(current: Session[], incoming: Session[]) {
  const byId = new Map(current.map((s) => [s.id, s]));
  for (const s of incoming) byId.set(s.id, s);
  return normalizeSessions([...byId.values()]);
}

export type Theme = "system" | "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === "light" || saved === "dark" ? saved : "system";
    } catch {
      return "system";
    }
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#16282a" : "#f3eee4");
    };
    apply();
    media.addEventListener("change", apply);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* per-device convenience only */
    }
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((t) => (t === "system" ? "dark" : t === "dark" ? "light" : "system"));
  }, []);

  return { theme, cycle };
}
