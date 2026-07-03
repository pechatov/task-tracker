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
import { TaskLabels } from "@/components/task-labels";
import { TaskForm } from "@/components/task-form";
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

function getBoardKey(data: Awaited<ReturnType<typeof getTodayData>>) {
  return [
    ...data.dayTasks.map((task) => `today:${task.id}:${task.title}:${task.dayPriority}`),
    ...data.backlogTasks.map((task) => `backlog:${task.id}:${task.title}:${task.dayPriority}`),
    ...data.weekTasks.map((task) => `week:${task.id}:${task.title}:${task.dueDate}`),
    ...data.overdueTasks.map((task) => `overdue:${task.id}:${task.title}:${task.dueDate}`)
  ].join("|");
}

function TodayMeetingsPanel({ data }: { data: TodayData }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Сегодня по времени</p>
          <h2>Встречи и блоки</h2>
        </div>
        <CalendarClock size={20} />
      </div>
      <div className="timeline">
        {data.timedTasks.length === 0 && data.calendarEvents.length === 0 ? (
          <p className="empty-state">Встреч и временных блоков на сегодня нет.</p>
        ) : null}
        {data.calendarEvents.map((event) => {
          const url = getEventUrl(event);
          const content = (
            <>
              <span className="time">{formatDisplayTime(event.startsAt)}</span>
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
              className="timeline-row"
              href={url}
              key={event.id}
              rel="noreferrer"
              target="_blank"
            >
              {content}
            </a>
          ) : (
            <div className="timeline-row" key={event.id}>
              {content}
            </div>
          );
        })}
        {data.timedTasks.map((task) => (
          <Link className="timeline-row" href={`/?taskId=${task.id}`} key={task.id}>
            <span className="time">
              {task.timeBlockStart ? formatDisplayTime(task.timeBlockStart) : ""}
            </span>
            <span
              className="event-marker"
              style={{
                "--event-color":
                  task.projectColor ?? task.streamColor ?? "#2d7dd2"
              } as CSSProperties}
            />
            <span className="task-main">
              <span className="task-title">{task.title}</span>
              <TaskLabels task={task} />
            </span>
          </Link>
        ))}
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
