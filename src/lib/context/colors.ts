export const CONTEXT_COLOR_PALETTE = [
  "#2d7dd2",
  "#e56b6f",
  "#6b8e23",
  "#8d5cf6",
  "#f28c28",
  "#00897b",
  "#c05a99",
  "#4a6fa5",
  "#d4a017",
  "#607d8b",
  "#9b5de5",
  "#00a6a6",
  "#c75146",
  "#5c7c2f",
  "#b36b00"
];

function normalizeColor(color: string) {
  return color.trim().toLowerCase();
}

function componentToHex(value: number) {
  return value.toString(16).padStart(2, "0");
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = hue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const match = lightness - chroma / 2;
  const [red, green, blue] =
    huePrime < 1
      ? [chroma, x, 0]
      : huePrime < 2
        ? [x, chroma, 0]
        : huePrime < 3
          ? [0, chroma, x]
          : huePrime < 4
            ? [0, x, chroma]
            : huePrime < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];

  return `#${componentToHex(Math.round((red + match) * 255))}${componentToHex(
    Math.round((green + match) * 255)
  )}${componentToHex(Math.round((blue + match) * 255))}`;
}

export function getNextContextColor(usedColors: string[]) {
  const used = new Set(usedColors.map(normalizeColor));
  const paletteColor = CONTEXT_COLOR_PALETTE.find(
    (color) => !used.has(normalizeColor(color))
  );

  if (paletteColor) {
    return paletteColor;
  }

  for (let index = 0; index < 360; index += 1) {
    const color = hslToHex((index * 137) % 360, 0.55, 0.43);

    if (!used.has(normalizeColor(color))) {
      return color;
    }
  }

  return CONTEXT_COLOR_PALETTE[0];
}
