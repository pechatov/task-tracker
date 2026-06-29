import { CalendarDays } from "lucide-react";

const slots = [
  { time: "09:00", title: "Focus block", type: "task" },
  { time: "11:30", title: "Product sync", type: "event" },
  { time: "15:00", title: "Review schema", type: "task" }
];

export default function CalendarPage() {
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1>Day / Week планирование</h1>
        </div>
        <div className="segmented">
          <button className="active" type="button">Day</button>
          <button type="button">Week</button>
        </div>
      </header>

      <section className="calendar-shell">
        <div className="calendar-toolbar">
          <CalendarDays size={20} />
          <span>Drag-and-drop scaffolding for time-blocked tasks</span>
        </div>
        <div className="day-grid">
          {slots.map((slot) => (
            <div className="slot-row" key={`${slot.time}-${slot.title}`}>
              <span className="time">{slot.time}</span>
              <button className={`slot-event ${slot.type}`} type="button">
                {slot.title}
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
