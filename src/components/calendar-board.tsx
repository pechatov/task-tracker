"use client";

import FullCalendar from "@fullcalendar/react";
import interactionPlugin, {
  Draggable,
  type EventDragStartArg,
  type EventDragStopArg,
  type EventReceiveArg,
  type EventResizeDoneArg
} from "@fullcalendar/interaction";
import ruLocale from "@fullcalendar/core/locales/ru";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
  DateSelectArg
} from "@fullcalendar/core";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Inbox
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { moveTaskToBacklog, scheduleTaskFromCalendar } from "@/app/actions/tasks";
import type { CalendarItem } from "@/lib/calendar/data";
import { formatDisplayDate } from "@/lib/date";
import type { TaskRow } from "@/lib/tasks/data";
import {
  getTaskSizeDurationMinutes,
  isTaskSize,
  taskSizeLabels
} from "@/lib/tasks/size";

type CalendarBoardProps = {
  backlogTasks: TaskRow[];
  initialDate: string;
  items: CalendarItem[];
  overdueTasks: TaskRow[];
};

type CalendarView = "timeGridDay" | "timeGridWeek" | "dayGridMonth";

type DragSource = "none" | "backlog" | "calendar";

type TaskStatusFilter = "all" | "open" | "done";

function isInsideRect(rect: DOMRect | undefined, x: number, y: number) {
  return (
    rect !== undefined &&
    x >= rect.left &&
    x <= rect.right &&
    y >= rect.top &&
    y <= rect.bottom
  );
}

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

function addDateDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function getDateOnly(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function getMonthEventEnd(item: CalendarItem) {
  if (!item.end) {
    return undefined;
  }

  const startDate = getDateOnly(item.start);
  const endDate = getDateOnly(item.end);

  if (endDate <= startDate) {
    return undefined;
  }

  return item.allDay ? endDate : addDateDays(endDate, 1);
}

function formatMonthTitle(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric"
  }).format(date);
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

export function CalendarBoard({
  backlogTasks,
  initialDate,
  items,
  overdueTasks
}: CalendarBoardProps) {
  const router = useRouter();
  const calendarRef = useRef<FullCalendar | null>(null);
  const taskSourceRef = useRef<HTMLElement | null>(null);
  const backlogPanelRef = useRef<HTMLElement | null>(null);
  const returningTaskTimerRef = useRef<number | null>(null);
  const [view, setView] = useState<CalendarView>("timeGridWeek");
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>("all");
  const [title, setTitle] = useState("");
  const [dragSource, setDragSource] = useState<DragSource>("none");
  const [isBacklogHovered, setIsBacklogHovered] = useState(false);
  const [returningTaskTitle, setReturningTaskTitle] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      if (returningTaskTimerRef.current !== null) {
        window.clearTimeout(returningTaskTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (dragSource !== "calendar") {
      return;
    }

    function onMouseMove(event: MouseEvent) {
      setIsBacklogHovered(
        isInsideRect(
          backlogPanelRef.current?.getBoundingClientRect(),
          event.clientX,
          event.clientY
        )
      );
    }

    document.addEventListener("mousemove", onMouseMove);
    return () => document.removeEventListener("mousemove", onMouseMove);
  }, [dragSource]);

  useEffect(() => {
    if (!taskSourceRef.current) {
      return;
    }

    const draggable = new Draggable(taskSourceRef.current, {
      itemSelector: ".calendar-backlog-item",
      eventData: (element) => ({
        title: element.dataset.title ?? "",
        duration: {
          minutes: Number(element.dataset.durationMinutes) || 60
        },
        backgroundColor: element.dataset.color,
        borderColor: element.dataset.color,
        textColor: "#ffffff",
        classNames: ["calendar-task-event"],
        extendedProps: {
          kind: "task",
          taskId: element.dataset.taskId,
          taskSize: element.dataset.taskSize,
          taskStatus: "open"
        }
      })
    });

    return () => draggable.destroy();
  }, []);

  const events = useMemo<EventInput[]>(() => {
    const isMonthView = view === "dayGridMonth";

    return (
      items
        .filter((item) => {
          if (item.kind !== "task" || taskStatusFilter === "all") {
            return true;
          }

          return item.taskStatus === taskStatusFilter;
        })
        .map((item) => ({
          id: item.id,
          title: item.title,
          start: isMonthView ? getDateOnly(item.start) : item.start,
          end: isMonthView ? getMonthEventEnd(item) : item.end ?? undefined,
          allDay: isMonthView ? true : item.allDay,
          editable: item.editable,
          durationEditable: item.kind === "task",
          startEditable: item.kind === "task",
          backgroundColor: item.kind === "task" ? item.color : "#ffffff",
          borderColor: item.color,
          classNames: [
            item.kind === "task" ? "calendar-task-event" : "calendar-meeting-event",
            item.kind === "task" && item.taskStatus === "done"
              ? "calendar-task-event-done"
              : ""
          ].filter(Boolean),
          textColor: item.kind === "task" ? "#ffffff" : "#24231f",
          extendedProps: {
            kind: item.kind,
            taskId: item.taskId,
            taskSize: item.taskSize,
            taskStatus: item.taskStatus,
            taskProjectName: item.taskProjectName,
            taskProjectColor: item.taskProjectColor,
            eventUrl: item.eventUrl,
            sourceLabel: item.sourceLabel
          }
        }))
    );
  }, [items, taskStatusFilter, view]);

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

    if (arg.view.type === "dayGridMonth") {
      setTitle(formatMonthTitle(arg.view.currentStart));
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

  function onCalendarTaskPointerDown(event: React.PointerEvent) {
    const startX = event.clientX;
    const startY = event.clientY;

    function onPointerMove(moveEvent: PointerEvent) {
      if (
        Math.abs(moveEvent.clientX - startX) +
          Math.abs(moveEvent.clientY - startY) >
        6
      ) {
        setDragSource("backlog");
      }
    }

    function onPointerUp() {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      setDragSource("none");
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }

  function onEventDragStart(arg: EventDragStartArg) {
    if (arg.event.extendedProps.kind === "task") {
      setDragSource("calendar");
    }
  }

  function onEventDragStop(arg: EventDragStopArg) {
    setDragSource("none");
    setIsBacklogHovered(false);

    const taskId = arg.event.extendedProps.taskId;
    const droppedOnBacklog = isInsideRect(
      backlogPanelRef.current?.getBoundingClientRect(),
      arg.jsEvent.clientX,
      arg.jsEvent.clientY
    );

    if (
      arg.event.extendedProps.kind !== "task" ||
      typeof taskId !== "string" ||
      !droppedOnBacklog
    ) {
      return;
    }

    const formData = new FormData();
    formData.set("taskId", taskId);
    setReturningTaskTitle(arg.event.title);
    arg.event.remove();

    if (returningTaskTimerRef.current !== null) {
      window.clearTimeout(returningTaskTimerRef.current);
    }

    returningTaskTimerRef.current = window.setTimeout(() => {
      setReturningTaskTitle(null);
      returningTaskTimerRef.current = null;
    }, 900);

    startTransition(async () => {
      try {
        await moveTaskToBacklog(formData);
      } finally {
        router.refresh();
      }
    });
  }

  function onEventReceive(arg: EventReceiveArg) {
    const taskId = arg.event.extendedProps.taskId;

    if (typeof taskId !== "string" || !arg.event.start) {
      arg.revert();
      return;
    }

    const formData = new FormData();
    formData.set("taskId", taskId);
    formData.set("isAllDay", arg.event.allDay ? "true" : "false");
    formData.set("wasAllDay", "true");
    formData.set("startsAt", arg.event.start.toISOString());
    formData.set(
      "endsAt",
      getEventEnd(arg.event.start, arg.event.end, arg.event.allDay).toISOString()
    );

    startTransition(async () => {
      try {
        await scheduleTaskFromCalendar(formData);
        arg.event.remove();
        router.refresh();
      } catch {
        arg.revert();
      }
    });
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

  function renderDraggableTask(
    task: TaskRow,
    options: { showDueDate?: boolean } = {}
  ) {
    const color = task.projectColor ?? task.streamColor ?? "#2d7dd2";

    return (
      <div
        className="calendar-backlog-item"
        data-color={color}
        data-duration-minutes={getTaskSizeDurationMinutes(task.size)}
        data-task-id={task.id}
        data-task-size={task.size}
        data-title={task.title}
        key={task.id}
        onClick={() => router.push(`/calendar?taskId=${task.id}`)}
        onPointerDown={onCalendarTaskPointerDown}
      >
        <span className="task-title">{task.title}</span>
        <span className="label-row">
          {task.projectName ? (
            <span
              className="label"
              style={{ "--label-color": task.projectColor ?? "#77736a" } as CSSProperties}
            >
              {task.projectName}
            </span>
          ) : null}
          {task.streamName ? (
            <span
              className="label"
              style={{ "--label-color": task.streamColor ?? "#77736a" } as CSSProperties}
            >
              {task.streamName}
            </span>
          ) : null}
          <span className="muted">{taskSizeLabels[task.size]}</span>
          {options.showDueDate && task.dueDate ? (
            <span className="date-chip overdue">{formatDisplayDate(task.dueDate)}</span>
          ) : null}
        </span>
      </div>
    );
  }

  return (
    <div className="calendar-layout">
      <section
        className={
          dragSource !== "none"
            ? "calendar-shell day-drop-hint"
            : "calendar-shell"
        }
      >
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
              <button
                className={view === "dayGridMonth" ? "active" : ""}
                type="button"
                onClick={() => changeView("dayGridMonth")}
              >
                Month
              </button>
            </div>
            <div className="segmented calendar-task-filter">
              <button
                className={taskStatusFilter === "all" ? "active" : ""}
                type="button"
                onClick={() => setTaskStatusFilter("all")}
              >
                Все задачи
              </button>
              <button
                className={taskStatusFilter === "open" ? "active" : ""}
                type="button"
                onClick={() => setTaskStatusFilter("open")}
              >
                Невыполненные
              </button>
              <button
                className={taskStatusFilter === "done" ? "active" : ""}
                type="button"
                onClick={() => setTaskStatusFilter("done")}
              >
                Выполненные
              </button>
            </div>
          </div>
        </div>
        {isPending ? <div className="calendar-saving">Сохраняю расписание...</div> : null}
        {dragSource !== "none" ? (
          <div className="calendar-drop-banner">
            <CalendarDays size={15} />
            {dragSource === "calendar"
              ? "Бросьте в строку «Весь день», чтобы оставить дату без временного слота"
              : "Бросьте на строку «Весь день», чтобы запланировать задачу на день без конкретного времени"}
          </div>
        ) : null}
        <div className="calendar-scroll-area">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={view}
            initialDate={initialDate}
            events={events}
            datesSet={onDatesSet}
            eventClick={onEventClick}
            eventDragStart={onEventDragStart}
            eventDragStop={onEventDragStop}
            eventDrop={onEventDrop}
            eventReceive={onEventReceive}
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
            dayMaxEvents={false}
            displayEventTime={view !== "dayGridMonth"}
            headerToolbar={false}
            locale={ruLocale}
            firstDay={1}
            eventContent={(arg) => {
              const props = arg.event.extendedProps;
              const projectName =
                typeof props.taskProjectName === "string"
                  ? props.taskProjectName
                  : null;
              const projectColor =
                typeof props.taskProjectColor === "string"
                  ? props.taskProjectColor
                  : "#77736a";

              return (
                <div className="fc-event-inner-content">
                  <span className="fc-event-title-text">{arg.event.title}</span>
                  {props.kind === "task" && projectName ? (
                    <span className="label-row calendar-event-labels">
                      <span
                        className="label"
                        style={{ "--label-color": projectColor } as CSSProperties}
                      >
                        {projectName}
                      </span>
                    </span>
                  ) : null}
                  {props.kind === "calendar-event" && props.sourceLabel ? (
                    <span className="fc-event-source">
                      {props.sourceLabel}
                    </span>
                  ) : null}
                  {props.eventUrl ? <ExternalLink size={12} /> : null}
                </div>
              );
            }}
          />
        </div>
      </section>

      <aside className="calendar-sidebar" ref={taskSourceRef}>
        <section
          className={[
            "panel calendar-backlog",
            dragSource === "calendar" ? "drop-target" : "",
            isBacklogHovered ? "drop-hover" : "",
            returningTaskTitle ? "is-receiving" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          ref={backlogPanelRef}
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Без даты</p>
              <h2>Бэклог</h2>
            </div>
            <Inbox size={20} />
          </div>
          <p className="muted calendar-backlog-hint">
            Перетащите задачу в календарь, чтобы запланировать её, или верните
            задачу из календаря сюда.
          </p>
          {dragSource === "calendar" ? (
            <div className="backlog-drop-overlay">
              <Inbox size={22} />
              Отпустите, чтобы убрать дату
            </div>
          ) : null}
          {returningTaskTitle ? (
            <div className="backlog-return-ghost">
              <Inbox size={16} />
              <span>{returningTaskTitle}</span>
            </div>
          ) : null}
          <div className="task-list">
            {backlogTasks.length === 0 ? (
              <p className="empty-state">Все задачи распланированы.</p>
            ) : null}
            {backlogTasks.map((task) => renderDraggableTask(task))}
          </div>
        </section>

        <section className="panel calendar-overdue-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Прошлые недели</p>
              <h2>Просроченные задачи</h2>
            </div>
            <AlertTriangle size={20} />
          </div>
          <p className="muted calendar-backlog-hint">
            Перетащите задачу в календарь, чтобы назначить новую дату.
          </p>
          <div className="task-list">
            {overdueTasks.length === 0 ? (
              <p className="empty-state">Нет задач из прошлых недель.</p>
            ) : null}
            {overdueTasks.map((task) =>
              renderDraggableTask(task, { showDueDate: true })
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
