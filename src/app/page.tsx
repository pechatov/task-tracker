import type { CSSProperties } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  X
} from "lucide-react";
import Link from "next/link";
import { deleteTask, moveTaskToToday } from "@/app/actions/tasks";
import { TaskForm } from "@/components/task-form";
import {
  formatDisplayDate,
  formatDisplayTime
} from "@/lib/date";
import {
  getTodayData,
  type CalendarEventRow,
  type TaskRow
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

function TaskLabels({ task }: { task: TaskRow }) {
  return (
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
      {!task.projectName && !task.streamName ? (
        <span className="muted">Без стрима и проекта</span>
      ) : null}
    </span>
  );
}

function TaskRowLink({ task }: { task: TaskRow }) {
  return (
    <Link className="task-row" href={`/?taskId=${task.id}`}>
      <span className="priority">{task.dayPriority}</span>
      <span className="task-main">
        <span className="task-title">{task.title}</span>
        <TaskLabels task={task} />
      </span>
    </Link>
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

      <section className="layout-grid">
        <TaskForm
          defaultDueDate={data.today}
          projects={data.projects}
          streams={data.streams}
        />

        <div className="stack">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Задачи дня</p>
                <h2>Открытые задачи</h2>
              </div>
              <span className="counter">{data.dayTasks.length}</span>
            </div>
            <div className="task-list">
              {data.dayTasks.length === 0 ? (
                <p className="empty-state">На сегодня нет открытых задач.</p>
              ) : null}
              {data.dayTasks.map((task) => (
                <TaskRowLink key={task.id} task={task} />
              ))}
            </div>
          </section>

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

          <section className="panel attention">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Просроченные</p>
                <h2>Нужно перенести</h2>
              </div>
              <AlertTriangle size={20} />
            </div>
            {data.overdueTasks.length === 0 ? (
              <p className="empty-state">Просроченных открытых задач нет.</p>
            ) : null}
            {data.overdueTasks.map((task) => (
              <div className="overdue-row" key={task.id}>
                <div>
                  <Link href={`/?taskId=${task.id}`}>
                    <strong>{task.title}</strong>
                  </Link>
                  <p>Дата выполнения: {formatDisplayDate(task.dueDate)}</p>
                </div>
                <form action={moveTaskToToday}>
                  <input name="taskId" type="hidden" value={task.id} />
                  <button className="secondary-button" type="submit">
                    <Clock3 size={16} />
                    На сегодня
                  </button>
                </form>
              </div>
            ))}
          </section>
        </div>
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
              defaultDueDate={data.today}
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
