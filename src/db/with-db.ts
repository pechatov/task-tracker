import { createDb, createPgPool } from "./client";

// Один пул на процесс: пересоздание пула на каждый вызов открывало новое
// TCP-соединение к Postgres на каждый рендер и server action. globalThis
// сохраняет пул между hot-reload модулей в `next dev`.
const globalForDb = globalThis as typeof globalThis & {
  __taskTrackerDb?: ReturnType<typeof createDb>;
};

function getDb() {
  globalForDb.__taskTrackerDb ??= createDb(createPgPool());
  return globalForDb.__taskTrackerDb;
}

export async function withDb<T>(
  callback: (db: ReturnType<typeof createDb>) => Promise<T>
) {
  return callback(getDb());
}

// Для CLI-скриптов: без закрытия пула процесс не завершается сам.
export async function closeDbPool() {
  const db = globalForDb.__taskTrackerDb;

  if (!db) {
    return;
  }

  globalForDb.__taskTrackerDb = undefined;
  await db.$client.end();
}
