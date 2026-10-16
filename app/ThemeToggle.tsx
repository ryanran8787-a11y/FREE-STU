"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";
const KEY = "free-stu-theme";
const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "跟隨系統", light: "淺色", dark: "深色" };

export function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** 淺 / 深 / 跟系統三段切，localStorage 記憶。 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      const t: Theme = saved === "light" || saved === "dark" ? saved : "system";
      setTheme(t);
      applyTheme(t);
    } catch {
      /* ignore */
    }
  }, []);
  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] ?? "system";
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    applyTheme(next);
  }
  return (
    <button
      onClick={cycle}
      title={`主題：${LABEL[theme]}（點我切換）`}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-paper hover:text-ink"
    >
      {theme === "light" ? <Sun size={16} /> : theme === "dark" ? <Moon size={16} /> : <Monitor size={16} />}
    </button>
  );
}

/** 首屏前套主題，避免閃白（跟 ThemeToggle 同規則，layout 用 beforeInteractive 注入）。 */
export const THEME_BOOT_JS = `(function(){try{var t=localStorage.getItem('${KEY}')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;
