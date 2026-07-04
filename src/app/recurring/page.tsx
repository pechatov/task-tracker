import type { CSSProperties } from "react";
import { PauseCircle, Repeat2, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { deleteRecurringTask } from "@/app/actions/recurring-tasks";
import { RecurringTaskForm } from "@/components/recurring-task-form";
import { formatDisplayDate } from "@/lib/date";
import {
  getRecurringTaskScheduleLabel,
  getRecurringTasksData,
  type RecurringTaskRow
} from "@/lib/recurring-tasks/data";

export const dynamic = "force-dynamic";

type RecurringTasksPageProps = {
  searchParams: Promise<{
    recurringTaskId?: string | string[];
  }>;
};

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function ContextLabel({
  color,
  name
}: {
  color: string | null;
  name: string | null;
}) {
  if (!name) {
    return null;
  }

  return (
    <span
      className="label"
      style={{ "--label-color": color ?? "#77736a" } as CSSProperties}
    >
      {name}
    </span>
  );
}

function RecurringTaskRowLink({ task }: { task: RecurringTaskRow }) {
  const isPaused = task.status === "paused";

  return (
    <Link
      className={[
        "task-row",
        "recurring-template-row",
        isPaused ? "paused" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      href={`/recurring?recurringTaskId=${task.id}` as Route}
    >
      <span className="recurring-template-icon" aria-hidden="true">
        {isPaused ? <PauseCircle size={18} /> : <Repeat2 size={18} />}
      </span>
      <span className="task-main">
        <span className="task-title">{task.title}</span>
        <span className="task-meta-row">
          <span className="date-chip">{getRecurringTaskScheduleLabel(task)}</span>
          <span className="date-chip">С {formatDisplayDate(task.startDate)}</span>
          {task.endDate ? (
            <span className="date-chip">До {formatDisplayDate(task.endDate)}</span>
          ) : null}
          <ContextLabel color={task.projectColor} name={task.projectName} />
          <ContextLabel color={task.streamColor} name={task.streamName} />
        </span>
      </span>
    </Link>
  );
}

export default async function RecurringTasksPage({
  searchParams
}: RecurringTasksPageProps) {
  const params = await searchParams;
  const data = await getRecurringTasksData(getFirst(params.recurringTaskId));

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Recurring</p>
          <h1>Повторяющиеся задачи</h1>
        </div>
      </header>

      <section className="layout-grid recurring-layout">
        <RecurringTaskForm
          defaultStartDate={data.today}
          projects={data.projects}
          streams={data.streams}
        />

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Шаблоны</p>
              <h2>Расписание</h2>
            </div>
            <Repeat2 size={20} />
          </div>
          <div className="task-list">
            {data.recurringTasks.length === 0 ? (
              <p className="empty-state">Повторяющихся задач пока нет.</p>
            ) : null}
            {data.recurringTasks.map((task) => (
              <RecurringTaskRowLink key={task.id} task={task} />
            ))}
          </div>
        </section>
      </section>

      {data.selectedRecurringTask ? (
        <div className="modal-backdrop">
          <section className="task-modal">
            <div className="modal-header">
              <Link
                className="icon-button"
                href={"/recurring" as Route}
                aria-label="Закрыть"
              >
                <X size={18} />
              </Link>
            </div>
            <RecurringTaskForm
              defaultStartDate={data.today}
              projects={data.projects}
              streams={data.streams}
              task={data.selectedRecurringTask}
            />
            <form action={deleteRecurringTask} className="delete-form">
              <input
                name="recurringTaskId"
                type="hidden"
                value={data.selectedRecurringTask.id}
              />
              <button className="danger-button" type="submit">
                Удалить шаблон
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
