import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createPgPool } from "./client";

async function main() {
  const pool = createPgPool();
  const db = createDb(pool);

  await migrate(db, { migrationsFolder: "drizzle" });
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
