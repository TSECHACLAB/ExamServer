"use client";

import { useSyncExternalStore } from "react";
import { Select } from "@/vendor/dads-runtime/components/Select";

const THEME_STORAGE_KEY = "examserver-theme";

const THEMES = [
  { id: "modern-light", label: "モダン" },
  { id: "modern-dark", label: "モダンダーク" },
  { id: "simple-light", label: "シンプルライト" },
  { id: "simple-dark", label: "シンプルダーク" },
  { id: "high-contrast", label: "ハイコントラスト" },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];

function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

interface ThemeSelectorProps {
  modernLightLabel?: string;
  variant?: "default" | "practice";
}

export default function ThemeSelector({
  modernLightLabel = "モダン",
  variant = "default",
}: ThemeSelectorProps) {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerThemeSnapshot
  );

  const handleChange = (nextTheme: ThemeId) => {
    document.documentElement.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Theme still changes for the current page even if persistence fails.
    }
    window.dispatchEvent(new CustomEvent("examserver-themechange"));
  };

  const options = THEMES.map((item) => (
    <option key={item.id} value={item.id}>
      {item.id === "modern-light" ? modernLightLabel : item.label}
    </option>
  ));

  if (variant === "practice") {
    return (
      <label className="flex min-w-0 items-center gap-2 text-sm font-bold text-solid-gray-800">
        <span className="hidden md:inline">表示</span>
        <Select
          value={theme}
          onChange={(event) => handleChange(event.target.value as ThemeId)}
          blockSize="sm"
          className="max-w-36 py-1 text-sm"
          aria-label="テーマを選択"
          suppressHydrationWarning
        >
          {options}
        </Select>
      </label>
    );
  }

  return (
    <label className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--foreground)] shadow-sm">
      <span className="text-[var(--text-muted)]">テーマ</span>
      <select
        value={theme}
        onChange={(event) => handleChange(event.target.value as ThemeId)}
        className="max-w-[9.5rem] bg-transparent text-xs font-semibold outline-none"
        aria-label="テーマを選択"
        suppressHydrationWarning
      >
        {options}
      </select>
    </label>
  );
}

function subscribeTheme(onStoreChange: () => void) {
  window.addEventListener("examserver-themechange", onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener("examserver-themechange", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getThemeSnapshot(): ThemeId {
  const current = document.documentElement.dataset.theme ?? null;
  if (isThemeId(current)) return current;

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(stored)) return stored;
  } catch {
    // localStorage can be unavailable in restricted browsing modes.
  }

  return "modern-light";
}

function getServerThemeSnapshot(): ThemeId {
  return "modern-light";
}
