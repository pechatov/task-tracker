import { eq } from "drizzle-orm";
import { createDb, createPgPool } from "../db/client";
import { users } from "../db/schema";
import {
  createIntegrationToken,
  integrationTokenScopes,
  isIntegrationTokenScope,
  type IntegrationTokenScope
} from "../lib/integrations/tokens";

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function parseScopes(value: string | undefined): IntegrationTokenScope[] {
  if (!value) {
    return [...integrationTokenScopes];
  }

  const scopes = value
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (scopes.length === 0 || !scopes.every(isIntegrationTokenScope)) {
    throw new Error(
      `Scopes must be a comma-separated list of: ${integrationTokenScopes.join(", ")}`
    );
  }

  return [...new Set(scopes)];
}

function parseExpiresAt(value: string | undefined) {
  if (!value) {
    return null;
  }

  const days = Number.parseInt(value, 10);

  if (!Number.isFinite(days) || days < 1) {
    throw new Error("--expires-days must be a positive integer");
  }

  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function main() {
  const email = getArg("--email")?.toLowerCase();
  const name = getArg("--name") ?? "external integration";

  if (!email) {
    throw new Error(
      "Usage: npm run integration-token:create -- --email user@example.com --name hermes"
    );
  }

  const pool = createPgPool();
  const db = createDb(pool);

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email)
    });

    if (!user) {
      throw new Error(`User ${email} not found`);
    }

    const result = await createIntegrationToken(db, {
      userId: user.id,
      name,
      scopes: parseScopes(getArg("--scopes")),
      expiresAt: parseExpiresAt(getArg("--expires-days"))
    });

    console.log(`Created integration token ${result.record.id} for ${email}`);
    console.log(`Name: ${result.record.name}`);
    console.log(`Scopes: ${result.record.scopes.join(", ")}`);
    console.log("Token:");
    console.log(result.token);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
