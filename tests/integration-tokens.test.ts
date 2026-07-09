import { describe, expect, it } from "vitest";
import {
  createIntegrationTokenSecret,
  hashIntegrationToken,
  integrationTokenScopes,
  isIntegrationTokenScope
} from "../src/lib/integrations/tokens";

describe("integration tokens", () => {
  it("generates opaque task tracker token secrets", () => {
    const token = createIntegrationTokenSecret();

    expect(token).toMatch(/^ttk_[A-Za-z0-9_-]{43}$/);
  });

  it("hashes token secrets without storing the raw value", () => {
    const token = "ttk_test-token";
    const firstHash = hashIntegrationToken(token);
    const secondHash = hashIntegrationToken(token);

    expect(firstHash).toBe(secondHash);
    expect(firstHash).not.toContain(token);
    expect(firstHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts only known integration scopes", () => {
    expect(integrationTokenScopes.every(isIntegrationTokenScope)).toBe(true);
    expect(isIntegrationTokenScope("calendar:write")).toBe(false);
    expect(isIntegrationTokenScope("tasks:write")).toBe(true);
  });
});
