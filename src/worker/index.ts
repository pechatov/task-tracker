import { setTimeout } from "node:timers/promises";
import { syncAllActiveCalendarSources } from "../lib/calendar/sync";
import { getEnv } from "../lib/env";

async function main() {
  const env = getEnv();
  const pollMs = env.CALENDAR_SYNC_POLL_SECONDS * 1000;

  console.info("worker started", {
    pollSeconds: env.CALENDAR_SYNC_POLL_SECONDS,
    syncPastDays: env.CALENDAR_SYNC_PAST_DAYS,
    syncFutureDays: env.CALENDAR_SYNC_FUTURE_DAYS
  });

  while (true) {
    await setTimeout(pollMs);
    console.info("calendar sync tick");
    await syncAllActiveCalendarSources();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
