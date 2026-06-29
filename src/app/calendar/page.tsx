import { CalendarBoard } from "@/components/calendar-board";
import { requireCurrentUser } from "@/lib/auth/session";
import { getCalendarData } from "@/lib/calendar/data";

export default async function CalendarPage() {
  await requireCurrentUser();
  const data = await getCalendarData();

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1>Day / Week планирование</h1>
        </div>
      </header>

      <CalendarBoard initialDate={data.today} items={data.items} />
    </main>
  );
}
