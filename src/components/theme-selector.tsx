"use client";

import { Check } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  defaultThemeId,
  isThemeId,
  themeOptions,
  themeStorageKey,
  type ThemeId
} from "@/lib/themes";

const themeChangeEvent = "task-tracker-theme-change";

function readCurrentTheme() {
  if (typeof window === "undefined") {
    return defaultThemeId;
  }

  const storedTheme = window.localStorage.getItem(themeStorageKey);

  if (isThemeId(storedTheme)) {
    return storedTheme;
  }

  const htmlTheme = document.documentElement.getAttribute("data-theme");

  if (isThemeId(htmlTheme)) {
    return htmlTheme;
  }

  return defaultThemeId;
}

function subscribeToThemeChanges(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(themeChangeEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(themeChangeEvent, onStoreChange);
  };
}

function applyThemePreference(themeId: ThemeId) {
  document.documentElement.setAttribute("data-theme", themeId);
  window.localStorage.setItem(themeStorageKey, themeId);
  window.dispatchEvent(new Event(themeChangeEvent));
}

export function ThemeSelector() {
  const selectedTheme = useSyncExternalStore(
    subscribeToThemeChanges,
    readCurrentTheme,
    () => defaultThemeId
  );

  return (
    <div className="theme-selector" role="radiogroup" aria-label="Выбор дизайна">
      {themeOptions.map((theme) => {
        const active = selectedTheme === theme.id;

        return (
          <button
            aria-checked={active}
            className={active ? "theme-option active" : "theme-option"}
            key={theme.id}
            onClick={() => applyThemePreference(theme.id)}
            role="radio"
            type="button"
          >
            <span className="theme-option-main">
              <span className="theme-option-heading">
                <strong>{theme.name}</strong>
                {active ? <Check size={16} /> : null}
              </span>
              <span>{theme.description}</span>
            </span>
            <span className="theme-option-swatches" aria-hidden="true">
              {theme.swatches.map((color) => (
                <span key={color} style={{ background: color }} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
