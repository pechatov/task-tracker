import { setTimeout } from "node:timers/promises";
import { syncAllActiveCalendarSources } from "../lib/calendar/sync";
import { getEnv } from "../lib/env";
import { ensureCurrentRecurringTaskInstancesForAllUsers } from "../lib/recurring-tasks/data";

async function main() {
  const env = getEnv();
  const pollMs = env.CALENDAR_SYNC_POLL_SECONDS * 1000;

  console.info("worker started", {
    pollSeconds: env.CALENDAR_SYNC_POLL_SECONDS,
    syncPastDays: env.CALENDAR_SYNC_PAST_DAYS,
    syncFutureDays: env.CALENDAR_SYNC_FUTURE_DAYS
  });

  while (true) {
    console.info("calendar sync tick");
    await ensureCurrentRecurringTaskInstancesForAllUsers();
    await syncAllActiveCalendarSources();
    await setTimeout(pollMs);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
