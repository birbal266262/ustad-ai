import { useEffect, useState } from "react";
import { applyTheme, getTheme } from "@/lib/theme";

const KEY = "ustad.nextMode";

function readStoredMode(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

function applyMode(enabled: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("nx-mode", enabled);
  if (enabled) {
    root.classList.remove("dark");
    root.classList.add("light");
    root.style.colorScheme = "light";
  } else {
    applyTheme(getTheme());
  }
}

let current = typeof window === "undefined" ? false : readStoredMode();
const listeners = new Set<(enabled: boolean) => void>();

export function setNextMode(enabled: boolean): void {
  current = enabled;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  }
  applyMode(enabled);
  listeners.forEach((listener) => listener(enabled));
}

export function useNextMode() {
  const [enabled, setEnabled] = useState(current);

  useEffect(() => {
    current = readStoredMode();
    setEnabled(current);
    applyMode(current);
    const listener = (next: boolean) => setEnabled(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { enabled, setEnabled: setNextMode };
}