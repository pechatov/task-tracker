import type { CSSProperties } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  X
} from "lucide-react";
import Link from "next/link";
import { deleteTask } from "@/app/actions/tasks";
import { QuickAddTask } from "@/components/quick-add-task";
import { TaskDoneToggle } from "@/components/task-done-toggle";
import { TaskLabels } from "@/components/task-labels";
import { TaskForm } from "@/components/task-form";
import { TaskTitle } from "@/components/task-title";
import { TodayTaskBoard } from "@/components/today-task-board";
import {
  formatDisplayDate,
  formatDisplayTime
} from "@/lib/date";
import {
  getTodayData,
  type CalendarEventRow,
  type TodayData
} from "@/lib/tasks/data";

export const dynamic = "force-dynamic";

type TodayPageProps = {
  searchParams: Promise<{
    taskId?: string | string[];
  }>;
};

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getEventUrl(event: CalendarEventRow) {
  if (event.eventUrl) {
    return event.eventUrl;
  }

  if (event.location?.startsWith("http://") || event.location?.startsWith("https://")) {
    return event.location;
  }

  return null;
}

type TimelineItem =
  | {
      id: string;
      isInactive: boolean;
      kind: "calendar-event";
      sortTime: number;
      event: CalendarEventRow;
    }
  | {
      id: string;
      isInactive: boolean;
      kind: "task";
      sortTime: number;
      task: TodayData["timedTasks"][number];
    };

function formatTimeRange(start: Date | null, end: Date | null) {
  if (!start) {
    return "";
  }

  if (!end) {
    return formatDisplayTime(start);
  }

  return `${formatDisplayTime(start)}-${formatDisplayTime(end)}`;
}

function getBoardKey(data: Awaited<ReturnType<typeof getTodayData>>) {
  return [
    ...data.dayTasks.map((task) => `today:${task.id}:${task.title}:${task.dayPriority}`),
    ...data.backlogTasks.map((task) => `backlog:${task.id}:${task.title}:${task.dayPriority}`),
    ...data.weekTasks.map((task) => `week:${task.id}:${task.title}:${task.dueDate}`),
    ...data.overdueTasks.map((task) => `overdue:${task.id}:${task.title}:${task.dueDate}`)
  ].join("|");
}

function TodayMeetingsPanel({ data }: { data: TodayData }) {
  const now = new Date();
  const timelineItems: TimelineItem[] = [
    ...data.calendarEvents.map((event) => ({
      id: `calendar-event:${event.id}`,
      isInactive: event.endsAt <= now,
      kind: "calendar-event" as const,
      sortTime: event.startsAt.getTime(),
      event
    })),
    ...data.timedTasks.map((task) => ({
      id: `task:${task.id}`,
      isInactive: task.status === "done",
      kind: "task" as const,
      sortTime: task.timeBlockStart?.getTime() ?? Number.MAX_SAFE_INTEGER,
      task
    }))
  ].sort((a, b) => {
    if (a.isInactive !== b.isInactive) {
      return a.isInactive ? 1 : -1;
    }

    return a.sortTime - b.sortTime;
  });

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Встречи и блоки</h2>
        </div>
        <CalendarClock size={20} />
      </div>
      <div className="timeline">
        {data.timedTasks.length === 0 && data.calendarEvents.length === 0 ? (
          <p className="empty-state">Встреч и временных блоков на сегодня нет.</p>
        ) : null}
        {timelineItems.map((item) => {
          if (item.kind === "task") {
            const { task } = item;

            return (
              <div
                className={[
                  "timeline-row",
                  "timeline-task-row",
                  item.isInactive ? "timeline-row-muted" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={item.id}
              >
                <span className="time">
                  {formatTimeRange(task.timeBlockStart, task.timeBlockEnd)}
                </span>
                <span
                  className="event-marker"
                  style={{
                    "--event-color":
                      task.projectColor ?? task.streamColor ?? "#2d7dd2"
                  } as CSSProperties}
                />
                <Link className="task-main" href={`/?taskId=${task.id}`}>
                  <TaskTitle task={task} />
                  <TaskLabels task={task} />
                </Link>
                <TaskDoneToggle status={task.status} taskId={task.id} />
              </div>
            );
          }

          const { event } = item;
          const url = getEventUrl(event);
          const rowClassName = [
            "timeline-row",
            item.isInactive ? "timeline-row-muted" : ""
          ]
            .filter(Boolean)
            .join(" ");
          const content = (
            <>
              <span className="time">
                {formatTimeRange(event.startsAt, event.endsAt)}
              </span>
              <span
                className="event-marker"
                style={{ "--event-color": event.calendarColor } as CSSProperties}
              />
              <span className="task-main">
                <span className="task-title">
                  {event.title}
                  {url ? <ExternalLink className="inline-icon" size={14} /> : null}
                </span>
                <span className="muted">{event.calendarName}</span>
              </span>
            </>
          );

          return url ? (
            <a
              className={rowClassName}
              href={url}
              key={event.id}
              rel="noreferrer"
              target="_blank"
            >
              {content}
            </a>
          ) : (
            <div className={rowClassName} key={event.id}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function TodayPage({ searchParams }: TodayPageProps) {
  const params = await searchParams;
  const data = await getTodayData(getFirst(params.taskId));

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Today</p>
          <h1>План дня</h1>
          <p className="muted">{formatDisplayDate(data.today)}</p>
        </div>
        <div className="sync-pill">
          <CheckCircle2 size={16} />
          Локальная база готова
        </div>
      </header>

      <section className="stack">
        <QuickAddTask>
          <TaskForm projects={data.projects} streams={data.streams} />
        </QuickAddTask>

        <TodayTaskBoard
          backlogTasks={data.backlogTasks}
          dayTasks={data.dayTasks}
          key={getBoardKey(data)}
          meetingsSlot={<TodayMeetingsPanel data={data} />}
          overdueTasks={data.overdueTasks}
          weekTasks={data.weekTasks}
        />
      </section>

      {data.selectedTask ? (
        <div className="modal-backdrop">
          <section className="task-modal">
            <div className="modal-header">
              <Link className="icon-button" href="/" aria-label="Закрыть">
                <X size={18} />
              </Link>
            </div>
            <TaskForm
              projects={data.projects}
              streams={data.streams}
              task={data.selectedTask}
            />
            <form action={deleteTask} className="delete-form">
              <input name="taskId" type="hidden" value={data.selectedTask.id} />
              <input name="returnTo" type="hidden" value="/" />
              <button className="danger-button" type="submit">
                Удалить задачу
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
