export const fontStorageKey = "task-tracker-font";

export const defaultFontId = "inter";

export const fontOptions = [
  {
    id: "inter",
    name: "Inter",
    description: "Нейтральный и плотный UI-шрифт с очень предсказуемой читаемостью.",
    sample: "План дня · Встречи и блоки",
    cssFamily: "var(--font-inter), Arial, Helvetica, sans-serif"
  },
  {
    id: "manrope",
    name: "Manrope",
    description: "Чуть более мягкий современный шрифт с аккуратной геометрией.",
    sample: "План дня · Встречи и блоки",
    cssFamily: "var(--font-manrope), Arial, Helvetica, sans-serif"
  },
  {
    id: "ibm-plex-sans",
    name: "IBM Plex Sans",
    description: "Технический и собранный шрифт, хорошо подходит для рабочих экранов.",
    sample: "План дня · Встречи и блоки",
    cssFamily: "var(--font-ibm-plex-sans), Arial, Helvetica, sans-serif"
  },
  {
    id: "noto-sans",
    name: "Noto Sans",
    description: "Спокойный универсальный вариант с сильной поддержкой языков.",
    sample: "План дня · Встречи и блоки",
    cssFamily: "var(--font-noto-sans), Arial, Helvetica, sans-serif"
  },
  {
    id: "source-sans-3",
    name: "Source Sans 3",
    description: "Мягкий, редакторский шрифт с хорошим балансом текста и UI.",
    sample: "План дня · Встречи и блоки",
    cssFamily: "var(--font-source-sans-3), Arial, Helvetica, sans-serif"
  },
  {
    id: "pt-sans",
    name: "PT Sans",
    description: "Компактный open-source шрифт с естественной русской кириллицей.",
    sample: "План дня · Встречи и блоки",
    cssFamily: "var(--font-pt-sans), Arial, Helvetica, sans-serif"
  }
] as const;

export type FontId = (typeof fontOptions)[number]["id"];

export function isFontId(value: string | null | undefined): value is FontId {
  return fontOptions.some((font) => font.id === value);
}
