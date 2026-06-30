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
  EventInput,
  DateSelectArg
} from "@fullcalendar/core";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { scheduleTaskFromCalendar } from "@/app/actions/tasks";
import type { CalendarItem } from "@/lib/calendar/data";
import { formatDisplayDate } from "@/lib/date";
import { getTaskSizeDurationMinutes, isTaskSize } from "@/lib/tasks/size";

type CalendarBoardProps = {
  initialDate: string;
  items: CalendarItem[];
};

type CalendarView = "timeGridDay" | "timeGridWeek";

function addMinutes(date: Date, minutes: number) {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

function subtractDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

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

function getTaskDurationEnd(event: EventDropArg["event"]) {
  const taskSize = event.extendedProps.taskSize;

  if (!event.start || !isTaskSize(taskSize)) {
    return null;
  }

  return addMinutes(event.start, getTaskSizeDurationMinutes(taskSize));
}

function getTaskScheduleFormData(
  event: EventDropArg["event"] | EventResizeDoneArg["event"],
  wasAllDay: boolean
) {
  const taskId = event.extendedProps.taskId;

  if (typeof taskId !== "string" || !event.start) {
    return null;
  }

  const formData = new FormData();
  formData.set("taskId", taskId);
  formData.set("isAllDay", event.allDay ? "true" : "false");
  formData.set("wasAllDay", wasAllDay ? "true" : "false");
  formData.set("startsAt", event.start.toISOString());
  formData.set("endsAt", getEventEnd(event.start, event.end, event.allDay).toISOString());

  return formData;
}

export function CalendarBoard({ initialDate, items }: CalendarBoardProps) {
  const router = useRouter();
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
        classNames: [
          item.kind === "task" ? "calendar-task-event" : "calendar-meeting-event"
        ],
        textColor: item.kind === "task" ? "#ffffff" : "#24231f",
        extendedProps: {
          kind: item.kind,
          taskId: item.taskId,
          taskSize: item.taskSize,
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
    if (arg.view.type === "timeGridWeek") {
      setTitle(
        `${formatDisplayDate(arg.start)} - ${formatDisplayDate(
          subtractDays(arg.end, 1)
        )}`
      );
      return;
    }

    setTitle(formatDisplayDate(arg.start));
  }

  function onSelect(arg: DateSelectArg) {
    const params = new URLSearchParams({
      create: "task",
      start: arg.startStr,
      end: arg.endStr,
      allDay: arg.allDay ? "true" : "false"
    });

    getCalendarApi()?.unselect();
    router.push(`/calendar?${params.toString()}`);
  }

  function scheduleChangedTask(
    event: EventDropArg["event"] | EventResizeDoneArg["event"],
    wasAllDay: boolean,
    revert: () => void
  ) {
    const formData = getTaskScheduleFormData(event, wasAllDay);

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

    if (arg.oldEvent.allDay && !arg.event.allDay) {
      const sizeEnd = getTaskDurationEnd(arg.event);

      if (sizeEnd) {
        arg.event.setEnd(sizeEnd);
      }
    }

    scheduleChangedTask(arg.event, arg.oldEvent.allDay, arg.revert);
  }

  function onEventResize(arg: EventResizeDoneArg) {
    if (arg.event.extendedProps.kind !== "task") {
      arg.revert();
      return;
    }

    scheduleChangedTask(arg.event, false, arg.revert);
  }

  function onEventClick(arg: EventClickArg) {
    const eventUrl = arg.event.extendedProps.eventUrl;
    const taskId = arg.event.extendedProps.taskId;

    if (typeof taskId === "string") {
      router.push(`/calendar?taskId=${taskId}`);
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
        select={onSelect}
        editable
        droppable
        selectable
        selectMirror
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
            <span className="fc-event-title-text">{arg.event.title}</span>
            {arg.event.extendedProps.kind === "calendar-event" &&
            arg.event.extendedProps.sourceLabel ? (
              <span className="fc-event-source">
                {arg.event.extendedProps.sourceLabel}
              </span>
            ) : null}
            {arg.event.extendedProps.eventUrl ? <ExternalLink size={12} /> : null}
          </div>
        )}
      />
    </section>
  );
}
