import { createHmac, randomBytes } from "node:crypto";
import { integrationTokens } from "@/db/schema";
import type { Db } from "@/db/client";
import { getEnv } from "@/lib/env";

export const integrationTokenScopes = [
  "tasks:read",
  "tasks:write",
  "calendar:read",
  "contexts:read"
] as const;

export type IntegrationTokenScope = (typeof integrationTokenScopes)[number];

export function isIntegrationTokenScope(
  value: unknown
): value is IntegrationTokenScope {
  return (
    typeof value === "string" &&
    integrationTokenScopes.includes(value as IntegrationTokenScope)
  );
}

export function createIntegrationTokenSecret() {
  return `ttk_${randomBytes(32).toString("base64url")}`;
}

export function hashIntegrationToken(token: string) {
  return createHmac("sha256", getEnv().AUTH_SESSION_SECRET)
    .update(token)
    .digest("hex");
}

export async function createIntegrationToken(
  db: Db,
  input: {
    expiresAt?: Date | null;
    name: string;
    scopes: IntegrationTokenScope[];
    userId: string;
  }
) {
  const token = createIntegrationTokenSecret();
  const [record] = await db
    .insert(integrationTokens)
    .values({
      userId: input.userId,
      name: input.name,
      tokenHash: hashIntegrationToken(token),
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null
    })
    .returning({
      id: integrationTokens.id,
      name: integrationTokens.name,
      scopes: integrationTokens.scopes,
      expiresAt: integrationTokens.expiresAt
    });

  return { record, token };
}
