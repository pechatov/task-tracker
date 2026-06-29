import { describe, expect, it } from "vitest";
import {
  CONTEXT_COLOR_PALETTE,
  getNextContextColor
} from "../src/lib/context/colors";

describe("context colors", () => {
  it("returns the first unused palette color", () => {
    expect(getNextContextColor([])).toBe(CONTEXT_COLOR_PALETTE[0]);
    expect(getNextContextColor([CONTEXT_COLOR_PALETTE[0]])).toBe(
      CONTEXT_COLOR_PALETTE[1]
    );
  });

  it("matches used colors case-insensitively", () => {
    expect(getNextContextColor([CONTEXT_COLOR_PALETTE[0].toUpperCase()])).toBe(
      CONTEXT_COLOR_PALETTE[1]
    );
  });
});
