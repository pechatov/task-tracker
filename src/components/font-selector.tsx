"use client";

import { Check } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  defaultFontId,
  fontOptions,
  fontStorageKey,
  isFontId,
  type FontId
} from "@/lib/fonts";

const fontChangeEvent = "task-tracker-font-change";

function readCurrentFont() {
  if (typeof window === "undefined") {
    return defaultFontId;
  }

  const storedFont = window.localStorage.getItem(fontStorageKey);

  if (isFontId(storedFont)) {
    return storedFont;
  }

  const htmlFont = document.documentElement.getAttribute("data-font");

  if (isFontId(htmlFont)) {
    return htmlFont;
  }

  return defaultFontId;
}

function subscribeToFontChanges(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(fontChangeEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(fontChangeEvent, onStoreChange);
  };
}

function applyFontPreference(fontId: FontId) {
  document.documentElement.setAttribute("data-font", fontId);
  window.localStorage.setItem(fontStorageKey, fontId);
  window.dispatchEvent(new Event(fontChangeEvent));
}

export function FontSelector() {
  const selectedFont = useSyncExternalStore(
    subscribeToFontChanges,
    readCurrentFont,
    () => defaultFontId
  );

  return (
    <div className="font-selector" role="radiogroup" aria-label="Выбор шрифта">
      {fontOptions.map((font) => {
        const active = selectedFont === font.id;

        return (
          <button
            aria-checked={active}
            className={active ? "font-option active" : "font-option"}
            key={font.id}
            onClick={() => applyFontPreference(font.id)}
            role="radio"
            style={{ fontFamily: font.cssFamily }}
            type="button"
          >
            <span className="font-option-heading">
              <strong>{font.name}</strong>
              {active ? <Check size={16} /> : null}
            </span>
            <span className="font-option-sample">{font.sample}</span>
            <span className="font-option-description">{font.description}</span>
          </button>
        );
      })}
    </div>
  );
}
