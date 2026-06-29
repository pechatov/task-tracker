export const themeStorageKey = "task-tracker-theme";

export const defaultThemeId = "muted-monokai";

export const themeOptions = [
  {
    id: "muted-monokai",
    name: "Muted Monokai Workbench",
    description:
      "Monokai-настроение без лишнего свечения. Спокойный вариант для ежедневной работы.",
    swatches: ["#191a1f", "#222329", "#78dce8", "#a6e22e", "#ff6188"]
  },
  {
    id: "classic-monokai",
    name: "Classic Monokai Focus",
    description:
      "Теплее и ближе к редакторскому Monokai: зеленый primary, фиолетовые события.",
    swatches: ["#272822", "#2f3029", "#a6e22e", "#ae81ff", "#f92672"]
  },
  {
    id: "low-glow",
    name: "Low-Glow Productivity",
    description:
      "Самый сдержанный рабочий вариант: яркие цвета только на смысловых маркерах.",
    swatches: ["#111318", "#181b21", "#66d9ef", "#98e04f", "#ff5c8a"]
  },
  {
    id: "monokai-dashboard",
    name: "Monokai Dashboard",
    description:
      "Более выразительная версия с заметной активной навигацией и акцентными панелями.",
    swatches: ["#16171d", "#20212a", "#78dce8", "#ffd866", "#ff6188"]
  },
  {
    id: "catppuccin-latte",
    name: "Catppuccin Latte",
    description:
      "Светлая Catppuccin-схема с мягким фоном и синим акцентом.",
    swatches: ["#eff1f5", "#e6e9ef", "#1e66f5", "#40a02b", "#d20f39"]
  },
  {
    id: "catppuccin-frappe",
    name: "Catppuccin Frappé",
    description:
      "Приглушенная темная Catppuccin-схема с холодной базой и пастельными акцентами.",
    swatches: ["#303446", "#292c3c", "#8caaee", "#a6d189", "#e78284"]
  },
  {
    id: "catppuccin-macchiato",
    name: "Catppuccin Macchiato",
    description:
      "Более глубокая темная Catppuccin-схема с сине-фиолетовым настроением.",
    swatches: ["#24273a", "#1e2030", "#8aadf4", "#a6da95", "#ed8796"]
  },
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    description:
      "Самая темная Catppuccin-схема с высоким контрастом и мягкими пастельными цветами.",
    swatches: ["#1e1e2e", "#181825", "#89b4fa", "#a6e3a1", "#f38ba8"]
  }
] as const;

export type ThemeId = (typeof themeOptions)[number]["id"];

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return themeOptions.some((theme) => theme.id === value);
}
