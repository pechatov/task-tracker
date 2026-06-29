"use client";

import FullCalendar from "@fullcalendar/react";
import interactionPlugin, {
  type EventResizeDoneArg
} from "@fullcalendar/interaction";
import ruLocale from "@fullcalendar/core/locales/ru";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput
} from "@fullcalendar/core";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { scheduleTaskFromCalendar } from "@/app/actions/tasks";
import type { CalendarItem } from "@/lib/calendar/data";

type CalendarBoardProps = {
  initialDate: string;
  items: CalendarItem[];
};

type CalendarView = "timeGridDay" | "timeGridWeek";

function getEventEnd(start: Date, end: Date | null, allDay: boolean) {
  if (end) {
    return end;
  }

  const fallback = new Date(start);

  if (allDay) {
    fallback.setDate(fallback.getDate() + 1);
  } else {
    fallback.setHours(fallback.getHours() + 1);
  }

  return fallback;
}

function getTaskScheduleFormData(event: EventDropArg["event"] | EventResizeDoneArg["event"]) {
  const taskId = event.extendedProps.taskId;

  if (typeof taskId !== "string" || !event.start) {
    return null;
  }

  const formData = new FormData();
  formData.set("taskId", taskId);
  formData.set("isAllDay", event.allDay ? "true" : "false");
  formData.set("startsAt", event.start.toISOString());
  formData.set("endsAt", getEventEnd(event.start, event.end, event.allDay).toISOString());

  return formData;
}

export function CalendarBoard({ initialDate, items }: CalendarBoardProps) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [view, setView] = useState<CalendarView>("timeGridDay");
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  const events = useMemo<EventInput[]>(
    () =>
      items.map((item) => ({
        id: item.id,
        title: item.title,
        start: item.start,
        end: item.end ?? undefined,
        allDay: item.allDay,
        editable: item.editable,
        durationEditable: item.kind === "task",
        startEditable: item.kind === "task",
        backgroundColor: item.kind === "task" ? item.color : "#ffffff",
        borderColor: item.color,
        textColor: item.kind === "task" ? "#ffffff" : "#24231f",
        extendedProps: {
          kind: item.kind,
          taskId: item.taskId,
          eventUrl: item.eventUrl,
          sourceLabel: item.sourceLabel
        }
      })),
    [items]
  );

  function getCalendarApi() {
    return calendarRef.current?.getApi() ?? null;
  }

  function changeView(nextView: CalendarView) {
    setView(nextView);
    getCalendarApi()?.changeView(nextView);
  }

  function move(direction: "prev" | "next" | "today") {
    const api = getCalendarApi();

    if (!api) {
      return;
    }

    if (direction === "today") {
      api.today();
    } else {
      api[direction]();
    }
  }

  function onDatesSet(arg: DatesSetArg) {
    setTitle(arg.view.title);
  }

  function scheduleChangedTask(
    event: EventDropArg["event"] | EventResizeDoneArg["event"],
    revert: () => void
  ) {
    const formData = getTaskScheduleFormData(event);

    if (!formData) {
      revert();
      return;
    }

    startTransition(async () => {
      try {
        await scheduleTaskFromCalendar(formData);
      } catch {
        revert();
      }
    });
  }

  function onEventDrop(arg: EventDropArg) {
    if (arg.event.extendedProps.kind !== "task") {
      arg.revert();
      return;
    }

    scheduleChangedTask(arg.event, arg.revert);
  }

  function onEventResize(arg: EventResizeDoneArg) {
    if (arg.event.extendedProps.kind !== "task") {
      arg.revert();
      return;
    }

    scheduleChangedTask(arg.event, arg.revert);
  }

  function onEventClick(arg: EventClickArg) {
    const eventUrl = arg.event.extendedProps.eventUrl;
    const taskId = arg.event.extendedProps.taskId;

    if (typeof taskId === "string") {
      window.location.href = `/?taskId=${taskId}`;
      return;
    }

    if (typeof eventUrl === "string" && eventUrl) {
      window.open(eventUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <section className="calendar-shell">
      <div className="calendar-toolbar">
        <div className="calendar-title">
          <CalendarDays size={20} />
          <span>{title}</span>
        </div>
        <div className="calendar-controls">
          <button className="icon-button" type="button" onClick={() => move("prev")} aria-label="Назад">
            <ChevronLeft size={18} />
          </button>
          <button className="secondary-button" type="button" onClick={() => move("today")}>
            Сегодня
          </button>
          <button className="icon-button" type="button" onClick={() => move("next")} aria-label="Вперед">
            <ChevronRight size={18} />
          </button>
          <div className="segmented">
            <button
              className={view === "timeGridDay" ? "active" : ""}
              type="button"
              onClick={() => changeView("timeGridDay")}
            >
              Day
            </button>
            <button
              className={view === "timeGridWeek" ? "active" : ""}
              type="button"
              onClick={() => changeView("timeGridWeek")}
            >
              Week
            </button>
          </div>
        </div>
      </div>
      {isPending ? <div className="calendar-saving">Сохраняю расписание...</div> : null}
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin, interactionPlugin]}
        initialView={view}
        initialDate={initialDate}
        events={events}
        datesSet={onDatesSet}
        eventClick={onEventClick}
        eventDrop={onEventDrop}
        eventResize={onEventResize}
        editable
        droppable
        eventResizableFromStart
        allDayMaintainDuration={false}
        allDaySlot
        nowIndicator
        height="auto"
        slotMinTime="10:00:00"
        slotMaxTime="23:00:00"
        slotDuration="00:30:00"
        defaultTimedEventDuration="01:00:00"
        headerToolbar={false}
        locale={ruLocale}
        firstDay={1}
        eventContent={(arg) => (
          <div className="fc-event-inner-content">
            <span>{arg.event.title}</span>
            {arg.event.extendedProps.eventUrl ? <ExternalLink size={12} /> : null}
          </div>
        )}
      />
    </section>
  );
}
