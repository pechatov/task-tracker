import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getEnv } from "../lib/env";
import * as schema from "./schema";

export function createPgPool(connectionString = getEnv().DATABASE_URL) {
  return new Pool({ connectionString });
}

export function createDb(pool = createPgPool()) {
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;
