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
  const script = `
(() => {
  try {
    const themes = ${JSON.stringify(themeOptions.map((theme) => theme.id))};
    const fonts = ${JSON.stringify(fontOptions.map((font) => font.id))};
    const storedTheme = window.localStorage.getItem(${JSON.stringify(themeStorageKey)});
    const storedFont = window.localStorage.getItem(${JSON.stringify(fontStorageKey)});
    const theme = themes.includes(storedTheme) ? storedTheme : ${JSON.stringify(defaultThemeId)};
    const font = fonts.includes(storedFont) ? storedFont : ${JSON.stringify(defaultFontId)};
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.font = font;
  } catch {
    document.documentElement.dataset.theme = ${JSON.stringify(defaultThemeId)};
    document.documentElement.dataset.font = ${JSON.stringify(defaultFontId)};
  }
})();
`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
