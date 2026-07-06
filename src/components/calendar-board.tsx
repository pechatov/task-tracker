"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  GripVertical,
  Inbox,
  Repeat2
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from "react";
import {
  moveTaskToBacklog,
  reorderCalendarTaskList,
  scheduleTaskFromCalendar
} from "@/app/actions/tasks";
import { TaskTitle } from "@/components/task-title";
import type { CalendarItem } from "@/lib/calendar/data";
import { formatDateInput, formatDisplayDate } from "@/lib/date";
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

type CalendarSidebarList = "backlog" | "overdue";

type CalendarSidebarLists = Record<CalendarSidebarList, TaskRow[]>;

const sidebarListOrder: CalendarSidebarList[] = ["backlog", "overdue"];

function isCalendarSidebarList(
  value: UniqueIdentifier | null | undefined
): value is CalendarSidebarList {
  return value === "backlog" || value === "overdue";
}

function makeSidebarLists(
  backlogTasks: TaskRow[],
  overdueTasks: TaskRow[]
): CalendarSidebarLists {
  return {
    backlog: backlogTasks,
    overdue: overdueTasks
  };
}

function findSidebarList(
  lists: CalendarSidebarLists,
  id: UniqueIdentifier | null | undefined
) {
  if (!id) {
    return null;
  }

  if (isCalendarSidebarList(id)) {
    return id;
  }

  const taskId = String(id);
  return (
    sidebarListOrder.find((list) =>
      lists[list].some((task) => task.id === taskId)
    ) ?? null
  );
}

function findSidebarTask(lists: CalendarSidebarLists, taskId: string) {
  for (const list of sidebarListOrder) {
    const task = lists[list].find((item) => item.id === taskId);

    if (task) {
      return task;
    }
  }

  return null;
}

function hasSameOrder(left: TaskRow[], right: TaskRow[]) {
  return (
    left.length === right.length &&
    left.every((task, index) => task.id === right[index]?.id)
  );
}

function normalizeIds(tasks: TaskRow[]) {
  return tasks.map((task) => task.id);
}

function moveTaskWithinSidebarList(
  lists: CalendarSidebarLists,
  list: CalendarSidebarList,
  activeId: string,
  overId: UniqueIdentifier
) {
  if (isCalendarSidebarList(overId)) {
    return lists;
  }

  const activeIndex = lists[list].findIndex((task) => task.id === activeId);
  const overIndex = lists[list].findIndex((task) => task.id === String(overId));

  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return lists;
  }

  return {
    ...lists,
    [list]: arrayMove(lists[list], activeIndex, overIndex)
  };
}

function hexToRgb(color: string) {
  const match = color.match(/^#?([0-9a-f]{6})$/i);

  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1], 16);

  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255
  };
}

function getReadableTextColor(backgroundColor: string) {
  const rgb = hexToRgb(backgroundColor);

  if (!rgb) {
    return "#ffffff";
  }

  const luminance =
    (0.2126 * rgb.red + 0.7152 * rgb.green + 0.0722 * rgb.blue) / 255;

  return luminance > 0.58 ? "#1f2330" : "#ffffff";
}

function getMeetingBackgroundColor(color: string) {
  return `color-mix(in srgb, ${color} 82%, var(--surface))`;
}

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
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function getDateOnly(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);

  return formatDateInput(date);
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
  formData.set("startsAt", event.allDay ? event.startStr : event.start.toISOString());
  formData.set(
    "endsAt",
    event.allDay
      ? event.endStr || addDateDays(event.startStr, 1)
      : getEventEnd(event.start, event.end, event.allDay).toISOString()
  );

  return formData;
}

function CalendarTaskDragPreview({ task }: { task: TaskRow }) {
  return (
    <div className="calendar-backlog-item calendar-sortable-task dnd-drag-preview">
      <span className="drag-handle preview">
        <GripVertical size={16} />
      </span>
      <span className="task-main">
        <TaskTitle task={task} />
      </span>
    </div>
  );
}

function SortableCalendarTask({
  list,
  onOpenTask,
  onTaskPointerDown,
  showDueDate = false,
  task
}: {
  list: CalendarSidebarList;
  onOpenTask: (taskId: string) => void;
  onTaskPointerDown: (event: React.PointerEvent) => void;
  showDueDate?: boolean;
  task: TaskRow;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition
  } = useSortable({
    id: task.id,
    data: { list }
  });
  const color = task.projectColor ?? task.streamColor ?? "#2d7dd2";
  const setRowRef = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node);
      setActivatorNodeRef(node);
    },
    [setActivatorNodeRef, setNodeRef]
  );
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      className={[
        "calendar-backlog-item",
        "calendar-sortable-task",
        isDragging ? "is-dragging" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      data-color={color}
      data-duration-minutes={getTaskSizeDurationMinutes(task.size)}
      data-task-id={task.id}
      data-task-size={task.size}
      data-title={task.title}
      onClick={() => onOpenTask(task.id)}
      onPointerDown={onTaskPointerDown}
      ref={setRowRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <span className="drag-handle" aria-hidden="true">
        <GripVertical size={16} />
      </span>
      <span className="task-main">
        <TaskTitle task={task} />
        <span className="label-row">
          {task.projectName ? (
            <span
              className="label"
              style={{ "--label-color": task.projectColor ?? "#77736a" } as CSSProperties}
            >
              {task.projectName}
            </span>
          ) : null}
          <span className="muted">{taskSizeLabels[task.size]}</span>
          {showDueDate && task.dueDate ? (
            <span className="date-chip overdue">{formatDisplayDate(task.dueDate)}</span>
          ) : null}
        </span>
      </span>
    </div>
  );
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
  const initialSidebarLists = useMemo(
    () => makeSidebarLists(backlogTasks, overdueTasks),
    [backlogTasks, overdueTasks]
  );
  const [sidebarLists, setSidebarListsState] =
    useState<CalendarSidebarLists>(initialSidebarLists);
  const [view, setView] = useState<CalendarView>("timeGridWeek");
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>("all");
  const [title, setTitle] = useState("");
  const [dragSource, setDragSource] = useState<DragSource>("none");
  const [isBacklogHovered, setIsBacklogHovered] = useState(false);
  const [returningTaskTitle, setReturningTaskTitle] = useState<string | null>(null);
  const [activeSidebarTask, setActiveSidebarTask] = useState<TaskRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const sidebarListsRef = useRef(sidebarLists);
  const dragStartSidebarListsRef = useRef<CalendarSidebarLists | null>(null);
  const activeOriginListRef = useRef<CalendarSidebarList | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  function setSidebarLists(
    next:
      | CalendarSidebarLists
      | ((current: CalendarSidebarLists) => CalendarSidebarLists)
  ) {
    const resolved =
      typeof next === "function" ? next(sidebarListsRef.current) : next;
    sidebarListsRef.current = resolved;
    setSidebarListsState(resolved);
  }

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
        .map((item) => {
          const backgroundColor =
            item.kind === "task" ? item.color : getMeetingBackgroundColor(item.color);

          return {
            id: item.id,
            title: item.title,
            start: isMonthView ? getDateOnly(item.start) : item.start,
            end: isMonthView ? getMonthEventEnd(item) : item.end ?? undefined,
            allDay: isMonthView ? true : item.allDay,
            editable: item.editable,
            durationEditable: item.kind === "task",
            startEditable: item.kind === "task",
            backgroundColor,
            borderColor: item.color,
            classNames: [
              item.kind === "task" ? "calendar-task-event" : "calendar-meeting-event",
              item.kind === "task" && item.taskStatus === "done"
                ? "calendar-task-event-done"
                : ""
            ].filter(Boolean),
            textColor:
              item.kind === "task"
                ? "#ffffff"
                : getReadableTextColor(item.color),
            extendedProps: {
              kind: item.kind,
              taskId: item.taskId,
              taskSize: item.taskSize,
              taskStatus: item.taskStatus,
              taskIsRecurring: item.taskIsRecurring,
              taskProjectName: item.taskProjectName,
              taskProjectColor: item.taskProjectColor,
              eventUrl: item.eventUrl,
              sourceLabel: item.sourceLabel
            }
          };
        })
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
    formData.set(
      "startsAt",
      arg.event.allDay ? arg.event.startStr : arg.event.start.toISOString()
    );
    formData.set(
      "endsAt",
      arg.event.allDay
        ? arg.event.endStr || addDateDays(arg.event.startStr, 1)
        : getEventEnd(arg.event.start, arg.event.end, arg.event.allDay).toISOString()
    );

    startTransition(async () => {
      try {
        await scheduleTaskFromCalendar(formData);
        removeSidebarTask(taskId);
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

  function removeSidebarTask(taskId: string) {
    setSidebarLists((current) => ({
      backlog: current.backlog.filter((task) => task.id !== taskId),
      overdue: current.overdue.filter((task) => task.id !== taskId)
    }));
  }

  function onSidebarDragStart(event: DragStartEvent) {
    const taskId = String(event.active.id);
    const currentLists = sidebarListsRef.current;
    const sourceList = findSidebarList(currentLists, taskId);

    dragStartSidebarListsRef.current = currentLists;
    activeOriginListRef.current = sourceList;
    setActiveSidebarTask(findSidebarTask(currentLists, taskId));
  }

  function onSidebarDragOver(event: DragOverEvent) {
    const activeId = String(event.active.id);
    const overId = event.over?.id;

    if (!overId) {
      return;
    }

    setSidebarLists((current) => {
      const sourceList = findSidebarList(current, activeId);
      const targetList = findSidebarList(current, overId);

      if (!sourceList || sourceList !== targetList) {
        return current;
      }

      return moveTaskWithinSidebarList(current, sourceList, activeId, overId);
    });
  }

  function restoreDragStartSidebarLists() {
    const startLists = dragStartSidebarListsRef.current;

    if (startLists) {
      setSidebarLists(startLists);
    }
  }

  function clearSidebarDragState() {
    setActiveSidebarTask(null);
    dragStartSidebarListsRef.current = null;
    activeOriginListRef.current = null;
  }

  function persistSidebarOrder(
    list: CalendarSidebarList,
    finalLists: CalendarSidebarLists
  ) {
    const formData = new FormData();
    formData.set("list", list);
    formData.set("taskIds", JSON.stringify(normalizeIds(finalLists[list])));

    startTransition(async () => {
      try {
        await reorderCalendarTaskList(formData);
        router.refresh();
      } catch {
        restoreDragStartSidebarLists();
      }
    });
  }

  function onSidebarDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    const originLists = dragStartSidebarListsRef.current;
    const originList = activeOriginListRef.current;
    const over = event.over;

    if (!over || !originLists || !originList) {
      restoreDragStartSidebarLists();
      clearSidebarDragState();
      return;
    }

    let finalLists = sidebarListsRef.current;
    const destinationList = findSidebarList(finalLists, taskId);
    const overList = findSidebarList(finalLists, over.id);

    if (!destinationList || destinationList !== originList || overList !== originList) {
      restoreDragStartSidebarLists();
      clearSidebarDragState();
      return;
    }

    finalLists = moveTaskWithinSidebarList(
      finalLists,
      originList,
      taskId,
      over.id
    );
    setSidebarLists(finalLists);

    if (!hasSameOrder(originLists[originList], finalLists[originList])) {
      persistSidebarOrder(originList, finalLists);
    }

    clearSidebarDragState();
  }

  function onSidebarDragCancel() {
    restoreDragStartSidebarLists();
    clearSidebarDragState();
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
            slotLabelFormat={{
              hour: "2-digit",
              hour12: false,
              minute: "2-digit"
            }}
            defaultTimedEventDuration="01:00:00"
            dayMaxEvents={false}
            displayEventTime={view !== "dayGridMonth"}
            eventTimeFormat={{
              hour: "2-digit",
              hour12: false,
              minute: "2-digit"
            }}
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
              const isRecurringTask =
                props.kind === "task" && props.taskIsRecurring === true;

              return (
                <div className="fc-event-inner-content">
                  <span className="fc-event-title-row">
                    {isRecurringTask ? (
                      <span
                        className="calendar-recurring-badge"
                        title="Повторяющаяся задача"
                      >
                        <Repeat2 size={11} />
                      </span>
                    ) : null}
                    <span className="fc-event-title-text">{arg.event.title}</span>
                  </span>
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
                  {props.eventUrl ? (
                    <ExternalLink className="fc-event-external-link" size={12} />
                  ) : null}
                </div>
              );
            }}
          />
        </div>
      </section>

      <DndContext
        collisionDetection={closestCenter}
        sensors={sensors}
        onDragCancel={onSidebarDragCancel}
        onDragEnd={onSidebarDragEnd}
        onDragOver={onSidebarDragOver}
        onDragStart={onSidebarDragStart}
      >
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
                <h2>Бэклог</h2>
              </div>
              <Inbox size={20} />
            </div>
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
            <SortableContext
              items={sidebarLists.backlog.map((task) => task.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="task-list dnd-task-list">
                {sidebarLists.backlog.length === 0 ? (
                  <p className="empty-state">Все задачи распланированы.</p>
                ) : null}
                {sidebarLists.backlog.map((task) => (
                  <SortableCalendarTask
                    key={task.id}
                    list="backlog"
                    onOpenTask={(taskId) => router.push(`/calendar?taskId=${taskId}`)}
                    onTaskPointerDown={onCalendarTaskPointerDown}
                    task={task}
                  />
                ))}
              </div>
            </SortableContext>
          </section>

          <section className="panel calendar-overdue-panel">
            <div className="panel-heading">
              <div>
                <h2>Просроченные задачи</h2>
              </div>
              <AlertTriangle size={20} />
            </div>
            <SortableContext
              items={sidebarLists.overdue.map((task) => task.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="task-list dnd-task-list">
                {sidebarLists.overdue.length === 0 ? (
                  <p className="empty-state">Нет задач из прошлых недель.</p>
                ) : null}
                {sidebarLists.overdue.map((task) => (
                  <SortableCalendarTask
                    key={task.id}
                    list="overdue"
                    onOpenTask={(taskId) => router.push(`/calendar?taskId=${taskId}`)}
                    onTaskPointerDown={onCalendarTaskPointerDown}
                    showDueDate
                    task={task}
                  />
                ))}
              </div>
            </SortableContext>
          </section>
        </aside>

        <DragOverlay>
          {activeSidebarTask ? (
            <CalendarTaskDragPreview task={activeSidebarTask} />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
