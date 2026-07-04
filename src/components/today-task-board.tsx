"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
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
import {
  AlertTriangle,
  CalendarDays,
  GripVertical,
  Inbox,
  ListChecks
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode
} from "react";
import {
  moveTaskOnTodayBoard
} from "@/app/actions/tasks";
import { formatDisplayDate } from "@/lib/date";
import type { TaskRow } from "@/lib/tasks/data";
import { TaskLabels } from "@/components/task-labels";
import { TaskDoneToggle } from "@/components/task-done-toggle";
import { TaskTitle } from "@/components/task-title";

type TaskColumn = "today" | "backlog" | "week" | "overdue";

type TaskColumns = Record<TaskColumn, TaskRow[]>;

type TaskBoardLists = {
  backlogTasks: TaskRow[];
  dayTasks: TaskRow[];
  overdueTasks: TaskRow[];
  weekTasks: TaskRow[];
};

type TodayTaskBoardProps = TaskBoardLists & {
  meetingsSlot: ReactNode;
};

const columnOrder: TaskColumn[] = ["today", "backlog", "week", "overdue"];

function isTaskColumn(value: UniqueIdentifier | null | undefined): value is TaskColumn {
  return (
    value === "today" ||
    value === "backlog" ||
    value === "week" ||
    value === "overdue"
  );
}

function makeColumns({
  backlogTasks,
  dayTasks,
  overdueTasks,
  weekTasks
}: TaskBoardLists): TaskColumns {
  return {
    today: dayTasks,
    backlog: backlogTasks,
    week: weekTasks,
    overdue: overdueTasks
  };
}

function findColumn(columns: TaskColumns, id: UniqueIdentifier | null | undefined) {
  if (!id) {
    return null;
  }

  if (isTaskColumn(id)) {
    return id;
  }

  const taskId = String(id);
  return columnOrder.find((column) =>
    columns[column].some((task) => task.id === taskId)
  ) ?? null;
}

function findTask(columns: TaskColumns, taskId: string) {
  for (const column of columnOrder) {
    const task = columns[column].find((item) => item.id === taskId);

    if (task) {
      return task;
    }
  }

  return null;
}

function canDropInto(source: TaskColumn | null, target: TaskColumn | null) {
  if (!source || !target) {
    return false;
  }

  if (target === "overdue") {
    return false;
  }

  return target !== "week" || source !== "week";
}

const taskBoardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);

  if (pointerCollisions.length > 0) {
    const itemCollisions = pointerCollisions.filter(
      (collision) => !isTaskColumn(collision.id)
    );

    return itemCollisions.length > 0 ? itemCollisions : pointerCollisions;
  }

  const closestCollisions = closestCenter(args);
  const itemCollisions = closestCollisions.filter(
    (collision) => !isTaskColumn(collision.id)
  );

  return itemCollisions.length > 0 ? itemCollisions : closestCollisions;
};

function hasSameOrder(left: TaskRow[], right: TaskRow[]) {
  return left.length === right.length && left.every((task, index) => task.id === right[index]?.id);
}

function normalizeIds(tasks: TaskRow[]) {
  return tasks.map((task) => task.id);
}

function ensureTaskInColumn(
  columns: TaskColumns,
  column: "today" | "backlog" | "week",
  taskId: string
) {
  if (columns[column].some((task) => task.id === taskId)) {
    return columns;
  }

  const task = findTask(columns, taskId);

  if (!task) {
    return columns;
  }

  return {
    ...columns,
    [column]: [...columns[column], task]
  };
}

function moveTaskBetweenColumns(
  columns: TaskColumns,
  activeId: string,
  overId: UniqueIdentifier
) {
  const sourceColumn = findColumn(columns, activeId);
  const targetColumn = findColumn(columns, overId);

  if (
    !sourceColumn ||
    !targetColumn ||
    sourceColumn === targetColumn ||
    !canDropInto(sourceColumn, targetColumn)
  ) {
    return columns;
  }

  const activeTask = columns[sourceColumn].find((task) => task.id === activeId);

  if (!activeTask) {
    return columns;
  }

  const nextSourceTasks = columns[sourceColumn].filter((task) => task.id !== activeId);
  const targetTasks = columns[targetColumn].filter((task) => task.id !== activeId);
  const overIndex = isTaskColumn(overId)
    ? targetTasks.length
    : targetTasks.findIndex((task) => task.id === String(overId));
  const insertAt = overIndex >= 0 ? overIndex : targetTasks.length;

  return {
    ...columns,
    [sourceColumn]: nextSourceTasks,
    [targetColumn]: [
      ...targetTasks.slice(0, insertAt),
      activeTask,
      ...targetTasks.slice(insertAt)
    ]
  };
}

function moveTaskWithinColumn(
  columns: TaskColumns,
  column: TaskColumn,
  activeId: string,
  overId: UniqueIdentifier
) {
  if (column === "overdue" || column === "week" || isTaskColumn(overId)) {
    return columns;
  }

  const activeIndex = columns[column].findIndex((task) => task.id === activeId);
  const overIndex = columns[column].findIndex((task) => task.id === String(overId));

  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return columns;
  }

  return {
    ...columns,
    [column]: arrayMove(columns[column], activeIndex, overIndex)
  };
}

function TaskDragPreview({ task }: { task: TaskRow }) {
  return (
    <div className="task-row draggable-task-row dnd-drag-preview">
      <span className="drag-handle preview">
        <GripVertical size={16} />
      </span>
      <span className="priority">{task.dayPriority}</span>
      <span className="task-main">
        <TaskTitle task={task} />
        <TaskLabels task={task} />
      </span>
    </div>
  );
}

function SortableTaskRow({
  column,
  priority,
  task
}: {
  column: TaskColumn;
  priority?: number;
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
    data: { column }
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

  if (column === "backlog") {
    return (
      <div
        className={[
          "task-row",
          "backlog-row",
          "draggable-task-row",
          isDragging ? "is-dragging" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        ref={setRowRef}
        style={style}
        {...attributes}
        {...listeners}
      >
        <span className="drag-handle" aria-hidden="true">
          <GripVertical size={16} />
        </span>
        <Link className="task-main" href={`/?taskId=${task.id}`}>
          <TaskTitle task={task} />
          <TaskLabels task={task} />
        </Link>
        <TaskDoneToggle status={task.status} taskId={task.id} />
      </div>
    );
  }

  if (column === "week" || column === "overdue") {
    return (
      <div
        className={[
          "task-row",
          "dated-task-row",
          "draggable-task-row",
          isDragging ? "is-dragging" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        ref={setRowRef}
        style={style}
        {...attributes}
        {...listeners}
      >
        <span className="drag-handle" aria-hidden="true">
          <GripVertical size={16} />
        </span>
        <Link className="task-main" href={`/?taskId=${task.id}`}>
          <TaskTitle task={task} />
          <span className="task-meta-row">
            <TaskLabels task={task} />
            <span className={column === "week" ? "date-chip" : "date-chip overdue"}>
              {task.dueDate ? formatDisplayDate(task.dueDate) : "-"}
            </span>
          </span>
        </Link>
        <TaskDoneToggle status={task.status} taskId={task.id} />
      </div>
    );
  }

  return (
    <div
      className={[
        "task-row",
        "draggable-task-row",
        "today-draggable-row",
        isDragging ? "is-dragging" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      ref={setRowRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <span className="drag-handle" aria-hidden="true">
        <GripVertical size={16} />
      </span>
      <span className="priority">{priority ?? task.dayPriority}</span>
      <Link className="task-main" href={`/?taskId=${task.id}`}>
        <TaskTitle task={task} />
        <TaskLabels task={task} />
      </Link>
      <TaskDoneToggle status={task.status} taskId={task.id} />
    </div>
  );
}

function TaskColumnSection({
  activeColumn,
  column,
  emptyText,
  heading,
  icon,
  panelClassName,
  overColumn,
  tasks
}: {
  activeColumn: TaskColumn | null;
  column: TaskColumn;
  emptyText: string;
  heading: string;
  icon: ReactNode;
  panelClassName?: string;
  overColumn: TaskColumn | null;
  tasks: TaskRow[];
}) {
  const { setNodeRef } = useDroppable({
    id: column,
    data: { column, kind: "column" }
  });
  const dropAllowed = canDropInto(activeColumn, column);
  const isDropTarget = activeColumn !== null && dropAllowed;
  const isDropHovered = isDropTarget && overColumn === column;

  return (
    <section
      className={[
        "panel",
        column === "overdue" ? "attention" : "",
        "dnd-panel",
        panelClassName ?? "",
        isDropTarget ? "drop-target" : "",
        isDropHovered ? "drop-hover" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      ref={setNodeRef}
    >
      <div className="panel-heading">
        <div>
          <h2>{heading}</h2>
        </div>
        {column === "today" || column === "backlog" ? (
          <span className="counter">{tasks.length}</span>
        ) : (
          icon
        )}
      </div>
      <SortableContext
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="task-list dnd-task-list">
          {tasks.length === 0 ? (
            <p className="empty-state">{emptyText}</p>
          ) : null}
          {tasks.map((task, index) => (
            <SortableTaskRow
              column={column}
              key={task.id}
              priority={column === "today" ? index + 1 : undefined}
              task={task}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

export function TodayTaskBoard({
  backlogTasks,
  dayTasks,
  meetingsSlot,
  overdueTasks,
  weekTasks
}: TodayTaskBoardProps) {
  const router = useRouter();
  const initialColumns = useMemo(
    () => makeColumns({ backlogTasks, dayTasks, overdueTasks, weekTasks }),
    [backlogTasks, dayTasks, overdueTasks, weekTasks]
  );
  const [columns, setColumnsState] = useState<TaskColumns>(initialColumns);
  const [activeColumn, setActiveColumn] = useState<TaskColumn | null>(null);
  const [activeTask, setActiveTask] = useState<TaskRow | null>(null);
  const [overColumn, setOverColumn] = useState<TaskColumn | null>(null);
  const [isPending, startTransition] = useTransition();
  const columnsRef = useRef(columns);
  const dragStartColumnsRef = useRef<TaskColumns | null>(null);
  const activeOriginColumnRef = useRef<TaskColumn | null>(null);

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

  function setColumns(next: TaskColumns | ((current: TaskColumns) => TaskColumns)) {
    const resolved = typeof next === "function" ? next(columnsRef.current) : next;
    columnsRef.current = resolved;
    setColumnsState(resolved);
  }

  function onDragStart(event: DragStartEvent) {
    const taskId = String(event.active.id);
    const currentColumns = columnsRef.current;
    const sourceColumn = findColumn(currentColumns, taskId);

    dragStartColumnsRef.current = currentColumns;
    activeOriginColumnRef.current = sourceColumn;
    setActiveColumn(sourceColumn);
    setActiveTask(findTask(currentColumns, taskId));
    setOverColumn(sourceColumn);
  }

  function onDragOver(event: DragOverEvent) {
    const activeId = String(event.active.id);
    const nextOverColumn = findColumn(columnsRef.current, event.over?.id);
    setOverColumn(nextOverColumn);

    if (!event.over) {
      return;
    }

    const over = event.over;

    setColumns((current) => {
      const sourceColumn = findColumn(current, activeId);
      const targetColumn = findColumn(current, over.id);

      if (!sourceColumn || !targetColumn || !canDropInto(sourceColumn, targetColumn)) {
        return current;
      }

      if (sourceColumn === targetColumn) {
        return moveTaskWithinColumn(current, targetColumn, activeId, over.id);
      }

      return moveTaskBetweenColumns(current, activeId, over.id);
    });
  }

  function restoreDragStartColumns() {
    const startColumns = dragStartColumnsRef.current;

    if (startColumns) {
      setColumns(startColumns);
    }
  }

  function clearDragState() {
    setActiveTask(null);
    setActiveColumn(null);
    setOverColumn(null);
    dragStartColumnsRef.current = null;
    activeOriginColumnRef.current = null;
  }

  function persistMove(
    taskId: string,
    destination: "today" | "backlog" | "week",
    finalColumns: TaskColumns
  ) {
    const formData = new FormData();
    formData.set("taskId", taskId);
    formData.set("destination", destination);
    formData.set("todayTaskIds", JSON.stringify(normalizeIds(finalColumns.today)));
    formData.set("backlogTaskIds", JSON.stringify(normalizeIds(finalColumns.backlog)));
    formData.set("weekTaskIds", JSON.stringify(normalizeIds(finalColumns.week)));

    startTransition(async () => {
      try {
        await moveTaskOnTodayBoard(formData);
        router.refresh();
      } catch {
        restoreDragStartColumns();
      }
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    const originColumns = dragStartColumnsRef.current;
    const originColumn = activeOriginColumnRef.current;

    const over = event.over;

    if (!over || !originColumns || !originColumn) {
      restoreDragStartColumns();
      clearDragState();
      return;
    }

    let finalColumns = columnsRef.current;
    let destinationColumn = findColumn(finalColumns, taskId);
    const overTargetColumn = findColumn(finalColumns, over.id);

    if (
      !destinationColumn ||
      !overTargetColumn ||
      !canDropInto(originColumn, overTargetColumn)
    ) {
      restoreDragStartColumns();
      clearDragState();
      return;
    }

    if (destinationColumn !== overTargetColumn) {
      finalColumns = moveTaskBetweenColumns(finalColumns, taskId, over.id);
      destinationColumn = findColumn(finalColumns, taskId);

      if (!destinationColumn) {
        restoreDragStartColumns();
        clearDragState();
        return;
      }

      setColumns(finalColumns);
    }

    if (originColumn === destinationColumn && destinationColumn === overTargetColumn) {
      finalColumns = moveTaskWithinColumn(
        finalColumns,
        destinationColumn,
        taskId,
        over.id
      );
      setColumns(finalColumns);
    }

    if (
      destinationColumn !== "today" &&
      destinationColumn !== "backlog" &&
      destinationColumn !== "week"
    ) {
      restoreDragStartColumns();
      clearDragState();
      return;
    }

    finalColumns = ensureTaskInColumn(finalColumns, destinationColumn, taskId);

    const movedBetweenColumns = originColumn !== destinationColumn;
    const reorderedToday =
      destinationColumn === "today" &&
      !hasSameOrder(originColumns.today, finalColumns.today);
    const reorderedBacklog =
      destinationColumn === "backlog" &&
      !hasSameOrder(originColumns.backlog, finalColumns.backlog);
    const movedToWeek = destinationColumn === "week" && originColumn !== "week";

    if (movedBetweenColumns || reorderedToday || reorderedBacklog || movedToWeek) {
      persistMove(taskId, destinationColumn, finalColumns);
    }

    clearDragState();
  }

  function onDragCancel() {
    restoreDragStartColumns();
    clearDragState();
  }

  return (
    <DndContext
      collisionDetection={taskBoardCollisionDetection}
      sensors={sensors}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
    >
      {isPending ? <div className="board-saving">Сохраняю порядок...</div> : null}

      <section className="today-board-layout">
        <div className="today-board-row today-board-top-row">
          <TaskColumnSection
            activeColumn={activeColumn}
            column="today"
            emptyText="На сегодня нет открытых задач."
            heading="Открытые задачи"
            icon={<ListChecks size={20} />}
            overColumn={overColumn}
            panelClassName="today-board-panel today-board-today"
            tasks={columns.today}
          />

          <TaskColumnSection
            activeColumn={activeColumn}
            column="week"
            emptyText="До конца недели больше нет открытых задач."
            heading="Задачи на неделю"
            icon={<CalendarDays size={20} />}
            overColumn={overColumn}
            panelClassName="today-board-panel today-board-week"
            tasks={columns.week}
          />
        </div>

        <div className="today-board-meetings">{meetingsSlot}</div>

        <div className="today-board-row today-board-bottom-row">
          <TaskColumnSection
            activeColumn={activeColumn}
            column="backlog"
            emptyText="В бэклоге пусто. Задачи без даты выполнения появятся здесь."
            heading="Бэклог"
            icon={<Inbox size={20} />}
            overColumn={overColumn}
            panelClassName="today-board-panel today-board-backlog"
            tasks={columns.backlog}
          />

          <TaskColumnSection
            activeColumn={activeColumn}
            column="overdue"
            emptyText="Просроченных открытых задач нет."
            heading="Просроченные задачи"
            icon={<AlertTriangle size={20} />}
            overColumn={overColumn}
            panelClassName="today-board-panel today-board-overdue"
            tasks={columns.overdue}
          />
        </div>
      </section>

      <DragOverlay>
        {activeTask ? <TaskDragPreview task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
