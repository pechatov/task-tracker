"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
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
import type { CSSProperties, ReactNode } from "react";
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
  scheduleTaskFromCalendar,
  toggleTaskDone
} from "@/app/actions/tasks";
import { TaskTitle } from "@/components/task-title";
import type { CalendarItem } from "@/lib/calendar/data";
import {
  combineDateAndTime,
  formatDateInput,
  formatDisplayDate
} from "@/lib/date";
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

type CalendarDropPreview = {
  style: CSSProperties;
  title: string;
};

type CalendarDropPreviewStyle = CSSProperties & {
  "--calendar-drop-preview-color": string;
};

type CalendarTaskEventElement = HTMLElement & {
  calendarTaskDoubleClick?: (event: MouseEvent) => void;
};

const sidebarListOrder: CalendarSidebarList[] = ["backlog", "overdue"];
const taskOpenClickDelayMs = 450;

const calendarSidebarCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);

  if (pointerCollisions.length > 0) {
    const itemCollisions = pointerCollisions.filter(
      (collision) => !isCalendarSidebarList(collision.id)
    );

    return itemCollisions.length > 0 ? itemCollisions : pointerCollisions;
  }

  return closestCenter(args);
};

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

function moveTaskBetweenSidebarLists(
  lists: CalendarSidebarLists,
  sourceList: CalendarSidebarList,
  targetList: CalendarSidebarList,
  activeId: string,
  overId: UniqueIdentifier
) {
  const activeTask = lists[sourceList].find((task) => task.id === activeId);

  if (!activeTask) {
    return lists;
  }

  const sourceTasks = lists[sourceList].filter((task) => task.id !== activeId);
  const targetTasks = lists[targetList].filter((task) => task.id !== activeId);
  const overIndex = isCalendarSidebarList(overId)
    ? targetTasks.length
    : targetTasks.findIndex((task) => task.id === String(overId));
  const insertIndex = overIndex < 0 ? targetTasks.length : overIndex;
  const movedTask = {
    ...activeTask,
    dueDate: null,
    timeBlockEnd: null,
    timeBlockStart: null
  };

  return {
    ...lists,
    [sourceList]: sourceTasks,
    [targetList]: [
      ...targetTasks.slice(0, insertIndex),
      movedTask,
      ...targetTasks.slice(insertIndex)
    ]
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

function getDragPoint(event: DragEndEvent | DragMoveEvent) {
  const activator = event.activatorEvent;

  if (
    "clientX" in activator &&
    "clientY" in activator &&
    typeof activator.clientX === "number" &&
    typeof activator.clientY === "number"
  ) {
    return {
      x: activator.clientX + event.delta.x,
      y: activator.clientY + event.delta.y
    };
  }

  return null;
}

function getDragEndPoint(event: DragEndEvent) {
  return getDragPoint(event);
}

function findElementContainingPoint<T extends HTMLElement>(
  root: HTMLElement,
  selector: string,
  x: number,
  y: number
) {
  return (
    Array.from(root.querySelectorAll<T>(selector)).find((element) => {
      const rect = element.getBoundingClientRect();

      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }) ?? null
  );
}

function findElementCrossingPoint<T extends HTMLElement>(
  root: HTMLElement,
  selector: string,
  x: number,
  y: number
) {
  return (
    Array.from(root.querySelectorAll<T>(selector)).find((element) => {
      const rect = element.getBoundingClientRect();

      return (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      );
    }) ?? null
  );
}

function getCalendarDropFormData(
  root: HTMLElement,
  point: { x: number; y: number },
  task: TaskRow
) {
  const allDayCell = findElementContainingPoint<HTMLElement>(
    root,
    ".fc-daygrid-day[data-date]",
    point.x,
    point.y
  );

  if (allDayCell?.dataset.date) {
    const formData = new FormData();
    formData.set("taskId", task.id);
    formData.set("isAllDay", "true");
    formData.set("wasAllDay", "true");
    formData.set("startsAt", allDayCell.dataset.date);
    formData.set("endsAt", addDateDays(allDayCell.dataset.date, 1));
    return formData;
  }

  const timeColumn = findElementContainingPoint<HTMLElement>(
    root,
    ".fc-timegrid-col[data-date]",
    point.x,
    point.y
  );
  const timeSlot = findElementCrossingPoint<HTMLElement>(
    root,
    ".fc-timegrid-slot[data-time]",
    point.x,
    point.y
  );
  const date = timeColumn?.dataset.date;
  const time = timeSlot?.dataset.time;

  if (!date || !time) {
    return null;
  }

  const start = combineDateAndTime(date, time.slice(0, 5));

  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const end = addMinutes(start, getTaskSizeDurationMinutes(task.size));
  const formData = new FormData();
  formData.set("taskId", task.id);
  formData.set("isAllDay", "false");
  formData.set("wasAllDay", "true");
  formData.set("startsAt", start.toISOString());
  formData.set("endsAt", end.toISOString());

  return formData;
}

function getCalendarDropPreview(
  root: HTMLElement,
  point: { x: number; y: number },
  task: TaskRow
): CalendarDropPreview | null {
  const rootRect = root.getBoundingClientRect();
  const previewColor = task.projectColor ?? task.streamColor ?? "#2d7dd2";
  const allDayCell = findElementContainingPoint<HTMLElement>(
    root,
    ".fc-daygrid-day[data-date]",
    point.x,
    point.y
  );

  if (allDayCell) {
    const frame = allDayCell.querySelector<HTMLElement>(".fc-daygrid-day-frame");
    const rect = (frame ?? allDayCell).getBoundingClientRect();

    return {
      title: task.title,
      style: {
        height: rect.height,
        left: rect.left - rootRect.left + root.scrollLeft,
        top: rect.top - rootRect.top + root.scrollTop,
        width: rect.width,
        "--calendar-drop-preview-color": previewColor
      } as CalendarDropPreviewStyle
    };
  }

  const timeColumn = findElementContainingPoint<HTMLElement>(
    root,
    ".fc-timegrid-col[data-date]",
    point.x,
    point.y
  );
  const timeSlot = findElementCrossingPoint<HTMLElement>(
    root,
    ".fc-timegrid-slot[data-time]",
    point.x,
    point.y
  );

  if (!timeColumn || !timeSlot) {
    return null;
  }

  const columnRect = timeColumn.getBoundingClientRect();
  const slotRect = timeSlot.getBoundingClientRect();
  const slotMinutes = 30;
  const durationSlots = getTaskSizeDurationMinutes(task.size) / slotMinutes;

  return {
    title: task.title,
    style: {
      height: Math.max(slotRect.height, slotRect.height * durationSlots),
      left: columnRect.left - rootRect.left + root.scrollLeft + 2,
      top: slotRect.top - rootRect.top + root.scrollTop,
      width: Math.max(0, columnRect.width - 4),
      "--calendar-drop-preview-color": previewColor
    } as CalendarDropPreviewStyle
  };
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

function SidebarDropZone({
  children,
  list
}: {
  children: ReactNode;
  list: CalendarSidebarList;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: list,
    data: { list }
  });

  return (
    <div
      className={["task-list dnd-task-list", isOver ? "drop-hover" : ""]
        .filter(Boolean)
        .join(" ")}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
}

function SortableCalendarTask({
  list,
  onOpenTask,
  showDueDate = false,
  task
}: {
  list: CalendarSidebarList;
  onOpenTask: (taskId: string) => void;
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
      onClick={() => onOpenTask(task.id)}
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
  const calendarDropRootRef = useRef<HTMLDivElement | null>(null);
  const backlogPanelRef = useRef<HTMLElement | null>(null);
  const openTaskTimerRef = useRef<number | null>(null);
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
  const [calendarDropPreview, setCalendarDropPreview] =
    useState<CalendarDropPreview | null>(null);
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
      if (openTaskTimerRef.current !== null) {
        window.clearTimeout(openTaskTimerRef.current);
      }

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

  function clearPendingTaskOpen() {
    if (openTaskTimerRef.current === null) {
      return;
    }

    window.clearTimeout(openTaskTimerRef.current);
    openTaskTimerRef.current = null;
  }

  function openTaskAfterClick(taskId: string) {
    clearPendingTaskOpen();

    openTaskTimerRef.current = window.setTimeout(() => {
      router.push(`/calendar?taskId=${taskId}`);
      openTaskTimerRef.current = null;
    }, taskOpenClickDelayMs);
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
      if (arg.jsEvent.detail > 1) {
        clearPendingTaskOpen();
        return;
      }

      openTaskAfterClick(taskId);
      return;
    }

    if (typeof eventUrl === "string" && eventUrl) {
      window.open(eventUrl, "_blank", "noopener,noreferrer");
    }
  }

  function onTaskDoubleClick(taskId: string) {
    clearPendingTaskOpen();

    const formData = new FormData();
    formData.set("taskId", taskId);

    startTransition(async () => {
      await toggleTaskDone(formData);
      router.refresh();
    });
  }

  function onEventDidMount(arg: { el: HTMLElement; event: EventDropArg["event"] }) {
    const taskId = arg.event.extendedProps.taskId;

    if (typeof taskId !== "string") {
      return;
    }

    const element = arg.el as CalendarTaskEventElement;
    const handler = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onTaskDoubleClick(taskId);
    };

    element.calendarTaskDoubleClick = handler;
    element.addEventListener("dblclick", handler);
  }

  function onEventWillUnmount(arg: { el: HTMLElement }) {
    const element = arg.el as CalendarTaskEventElement;

    if (!element.calendarTaskDoubleClick) {
      return;
    }

    element.removeEventListener("dblclick", element.calendarTaskDoubleClick);
    delete element.calendarTaskDoubleClick;
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
    setDragSource(sourceList ? "backlog" : "none");
    setActiveSidebarTask(findSidebarTask(currentLists, taskId));
  }

  function onSidebarDragMove(event: DragMoveEvent) {
    const taskId = String(event.active.id);
    const point = getDragPoint(event);
    const task =
      activeSidebarTask ??
      (dragStartSidebarListsRef.current
        ? findSidebarTask(dragStartSidebarListsRef.current, taskId)
        : null);
    const root = calendarDropRootRef.current;

    if (!point || !task || !root) {
      setCalendarDropPreview(null);
      return;
    }

    setCalendarDropPreview(getCalendarDropPreview(root, point, task));
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

      if (!sourceList || !targetList) {
        return current;
      }

      if (sourceList === "overdue" && targetList === "backlog") {
        return moveTaskBetweenSidebarLists(
          current,
          sourceList,
          targetList,
          activeId,
          overId
        );
      }

      if (sourceList !== targetList) {
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
    setDragSource("none");
    setCalendarDropPreview(null);
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

  function persistOverdueTaskToBacklog(
    taskId: string,
    finalLists: CalendarSidebarLists,
    fallbackLists: CalendarSidebarLists
  ) {
    const moveFormData = new FormData();
    moveFormData.set("taskId", taskId);

    const reorderFormData = new FormData();
    reorderFormData.set("list", "backlog");
    reorderFormData.set(
      "taskIds",
      JSON.stringify(normalizeIds(finalLists.backlog))
    );

    startTransition(async () => {
      try {
        await moveTaskToBacklog(moveFormData);
        await reorderCalendarTaskList(reorderFormData);
        router.refresh();
      } catch {
        setSidebarLists(fallbackLists);
      }
    });
  }

  function persistSidebarTaskToCalendar(
    formData: FormData,
    taskId: string,
    fallbackLists: CalendarSidebarLists
  ) {
    startTransition(async () => {
      try {
        await scheduleTaskFromCalendar(formData);
        removeSidebarTask(taskId);
        router.refresh();
      } catch {
        setSidebarLists(fallbackLists);
      }
    });
  }

  function onSidebarDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    const originLists = dragStartSidebarListsRef.current;
    const originList = activeOriginListRef.current;
    const over = event.over;

    if (!originLists || !originList) {
      restoreDragStartSidebarLists();
      clearSidebarDragState();
      return;
    }

    const dragEndPoint = getDragEndPoint(event);
    const activeTask = findSidebarTask(originLists, taskId);
    const calendarDropFormData =
      dragEndPoint && activeTask && calendarDropRootRef.current
        ? getCalendarDropFormData(
            calendarDropRootRef.current,
            dragEndPoint,
            activeTask
          )
        : null;

    if (calendarDropFormData) {
      persistSidebarTaskToCalendar(calendarDropFormData, taskId, originLists);
      clearSidebarDragState();
      return;
    }

    if (!over) {
      restoreDragStartSidebarLists();
      clearSidebarDragState();
      return;
    }

    let finalLists = sidebarListsRef.current;
    const destinationList = findSidebarList(finalLists, taskId);
    const overList = findSidebarList(finalLists, over.id);

    if (
      originList === "overdue" &&
      overList === "backlog"
    ) {
      if (destinationList !== "backlog") {
        finalLists = moveTaskBetweenSidebarLists(
          finalLists,
          "overdue",
          "backlog",
          taskId,
          over.id
        );
        setSidebarLists(finalLists);
      } else if (!isCalendarSidebarList(over.id)) {
        finalLists = moveTaskWithinSidebarList(
          finalLists,
          "backlog",
          taskId,
          over.id
        );
        setSidebarLists(finalLists);
      }

      persistOverdueTaskToBacklog(taskId, finalLists, originLists);
      clearSidebarDragState();
      return;
    }

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
        {isPending ? <div className="calendar-saving">Сохраняю изменения...</div> : null}
        {dragSource !== "none" ? (
          <div className="calendar-drop-banner">
            <CalendarDays size={15} />
            {dragSource === "calendar"
              ? "Бросьте в строку «Весь день», чтобы оставить дату без временного слота"
              : "Бросьте на строку «Весь день», чтобы запланировать задачу на день без конкретного времени"}
          </div>
        ) : null}
        <div className="calendar-scroll-area" ref={calendarDropRootRef}>
          {calendarDropPreview ? (
            <div
              className="calendar-drop-slot-preview"
              style={calendarDropPreview.style}
            >
              <span>{calendarDropPreview.title}</span>
            </div>
          ) : null}
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={view}
            initialDate={initialDate}
            events={events}
            datesSet={onDatesSet}
            eventClick={onEventClick}
            eventDidMount={onEventDidMount}
            eventDragStart={onEventDragStart}
            eventDragStop={onEventDragStop}
            eventDrop={onEventDrop}
            eventReceive={onEventReceive}
            eventResize={onEventResize}
            eventWillUnmount={onEventWillUnmount}
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
        collisionDetection={calendarSidebarCollisionDetection}
        id="calendar-sidebar-dnd"
        sensors={sensors}
        onDragCancel={onSidebarDragCancel}
        onDragEnd={onSidebarDragEnd}
        onDragMove={onSidebarDragMove}
        onDragOver={onSidebarDragOver}
        onDragStart={onSidebarDragStart}
      >
        <aside className="calendar-sidebar">
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
              <SidebarDropZone list="backlog">
                {sidebarLists.backlog.length === 0 ? (
                  <p className="empty-state">Все задачи распланированы.</p>
                ) : null}
                {sidebarLists.backlog.map((task) => (
                  <SortableCalendarTask
                    key={task.id}
                    list="backlog"
                    onOpenTask={(taskId) => router.push(`/calendar?taskId=${taskId}`)}
                    task={task}
                  />
                ))}
              </SidebarDropZone>
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
              <SidebarDropZone list="overdue">
                {sidebarLists.overdue.length === 0 ? (
                  <p className="empty-state">Нет задач из прошлых недель.</p>
                ) : null}
                {sidebarLists.overdue.map((task) => (
                  <SortableCalendarTask
                    key={task.id}
                    list="overdue"
                    onOpenTask={(taskId) => router.push(`/calendar?taskId=${taskId}`)}
                    showDueDate
                    task={task}
                  />
                ))}
              </SidebarDropZone>
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
