"use client";

import { useEffect } from "react";
import {
  defaultFontId,
  fontOptions,
  fontStorageKey
} from "@/lib/fonts";
import {
  defaultThemeId,
  themeOptions,
  themeStorageKey
} from "@/lib/themes";

export function ThemeScript() {
  useEffect(() => {
    try {
      const themeIds = themeOptions.map((theme) => theme.id);
      const fontIds = fontOptions.map((font) => font.id);
      const storedTheme = window.localStorage.getItem(themeStorageKey);
      const storedFont = window.localStorage.getItem(fontStorageKey);
      let theme = defaultThemeId;
      let font = defaultFontId;

      if (storedTheme && themeIds.some((themeId) => themeId === storedTheme)) {
        theme = storedTheme;
      }

      if (storedFont && fontIds.some((fontId) => fontId === storedFont)) {
        font = storedFont;
      }

      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.font = font;
    } catch {
      document.documentElement.dataset.theme = defaultThemeId;
      document.documentElement.dataset.font = defaultFontId;
    }
  }, []);

  return null;
}
