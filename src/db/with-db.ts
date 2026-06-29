import { createDb, createPgPool } from "@/db/client";

export async function withDb<T>(
  callback: (db: ReturnType<typeof createDb>) => Promise<T>
) {
  const pool = createPgPool();
  const db = createDb(pool);

  try {
    return await callback(db);
  } finally {
    await pool.end();
  }
}
