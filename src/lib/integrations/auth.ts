import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { createDb } from "@/db/client";
import { withDb } from "@/db/with-db";
import { integrationTokens, users } from "@/db/schema";
import {
  hashIntegrationToken,
  isIntegrationTokenScope,
  type IntegrationTokenScope
} from "@/lib/integrations/tokens";

export class IntegrationAuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403
  ) {
    super(message);
  }
}

export type IntegrationAuth = {
  scopes: IntegrationTokenScope[];
  tokenId: string;
  user: {
    email: string;
    id: string;
  };
};

function getBearerToken(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

function normalizeScopes(scopes: unknown): IntegrationTokenScope[] {
  if (!Array.isArray(scopes)) {
    return [];
  }

  return scopes.filter(isIntegrationTokenScope);
}

export async function authenticateIntegrationToken(
  db: ReturnType<typeof createDb>,
  token: string | null,
  requiredScopes: IntegrationTokenScope[]
): Promise<IntegrationAuth> {
  if (!token) {
    throw new IntegrationAuthError("Missing bearer token", 401);
  }

  const now = new Date();
  const [record] = await db
    .select({
      tokenId: integrationTokens.id,
      scopes: integrationTokens.scopes,
      userId: users.id,
      userEmail: users.email
    })
    .from(integrationTokens)
    .innerJoin(users, eq(integrationTokens.userId, users.id))
    .where(
      and(
        eq(integrationTokens.tokenHash, hashIntegrationToken(token)),
        isNull(integrationTokens.revokedAt),
        or(isNull(integrationTokens.expiresAt), gt(integrationTokens.expiresAt, now))
      )
    )
    .limit(1);

  if (!record) {
    throw new IntegrationAuthError("Invalid bearer token", 401);
  }

  const scopes = normalizeScopes(record.scopes);
  const missingScope = requiredScopes.find((scope) => !scopes.includes(scope));

  if (missingScope) {
    throw new IntegrationAuthError(`Missing required scope: ${missingScope}`, 403);
  }

  await db
    .update(integrationTokens)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(eq(integrationTokens.id, record.tokenId));

  return {
    scopes,
    tokenId: record.tokenId,
    user: {
      email: record.userEmail,
      id: record.userId
    }
  };
}

export async function requireIntegrationAuth(
  request: NextRequest,
  requiredScopes: IntegrationTokenScope[]
) {
  return withDb((db) =>
    authenticateIntegrationToken(
      db,
      getBearerToken(request.headers.get("authorization")),
      requiredScopes
    )
  );
}
