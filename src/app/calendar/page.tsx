import { X } from "lucide-react";
import Link from "next/link";
import { deleteTask } from "@/app/actions/tasks";
import { CalendarBoard } from "@/components/calendar-board";
import { TaskForm } from "@/components/task-form";
import { requireCurrentUser } from "@/lib/auth/session";
import { getCalendarData } from "@/lib/calendar/data";
import { formatDateInput } from "@/lib/date";

type CalendarPageProps = {
  searchParams: Promise<{
    allDay?: string | string[];
    create?: string | string[];
    end?: string | string[];
    start?: string | string[];
    taskId?: string | string[];
  }>;
};

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseSlotDate(value: string | undefined, allDay: boolean) {
  if (!value) {
    return null;
  }

  if (allDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getCreateDefaults(params: Awaited<CalendarPageProps["searchParams"]>) {
  if (getFirst(params.create) !== "task") {
    return null;
  }

  const allDay = getFirst(params.allDay) === "true";
  const start = parseSlotDate(getFirst(params.start), allDay);
  const end = parseSlotDate(getFirst(params.end), allDay);

  if (!start) {
    return null;
  }

  return {
    dueDate: formatDateInput(start),
    timeBlockStart: allDay ? null : start,
    timeBlockEnd: !allDay && end && end > start ? end : null
  };
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  await requireCurrentUser();
  const params = await searchParams;
  const data = await getCalendarData(getFirst(params.taskId));
  const createDefaults = data.selectedTask ? null : getCreateDefaults(params);

  return (
    <main className="page calendar-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1>Day / Week планирование</h1>
        </div>
      </header>

      <CalendarBoard
        backlogTasks={data.backlogTasks}
        initialDate={data.today}
        items={data.items}
        overdueTasks={data.overdueTasks}
      />

      {data.selectedTask ? (
        <div className="modal-backdrop">
          <section className="task-modal">
            <div className="modal-header">
              <Link className="icon-button" href="/calendar" aria-label="Закрыть">
                <X size={18} />
              </Link>
            </div>
            <TaskForm
              projects={data.projects}
              returnTo="/calendar"
              streams={data.streams}
              task={data.selectedTask}
            />
            <form action={deleteTask} className="delete-form">
              <input name="taskId" type="hidden" value={data.selectedTask.id} />
              <input name="returnTo" type="hidden" value="/calendar" />
              <button className="danger-button" type="submit">
                Удалить задачу
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {createDefaults ? (
        <div className="modal-backdrop">
          <section className="task-modal">
            <div className="modal-header">
              <Link className="icon-button" href="/calendar" aria-label="Закрыть">
                <X size={18} />
              </Link>
            </div>
            <TaskForm
              defaultDueDate={createDefaults.dueDate}
              defaultTimeBlockEnd={createDefaults.timeBlockEnd}
              defaultTimeBlockStart={createDefaults.timeBlockStart}
              projects={data.projects}
              returnTo="/calendar"
              streams={data.streams}
            />
          </section>
        </div>
      ) : null}
    </main>
  );
}
