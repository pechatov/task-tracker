import { Repeat2 } from "lucide-react";
import { createTask, updateTask } from "@/app/actions/tasks";
import { DueDateField } from "@/components/due-date-field";
import { TaskContextPicker } from "@/components/task-context-picker";
import { TaskStatusCycle } from "@/components/task-status-cycle";
import { formatDisplayDate, formatTimeInput } from "@/lib/date";
import type {
  ProjectOption,
  StreamOption,
  TaskRow
} from "@/lib/tasks/data";
import { taskSizeLabels } from "@/lib/tasks/size";

type TaskFormProps = {
  defaultDueDate?: string | null;
  defaultTimeBlockEnd?: Date | null;
  defaultTimeBlockStart?: Date | null;
  projects: ProjectOption[];
  returnTo?: "/" | "/calendar";
  streams: StreamOption[];
  task?: TaskRow | null;
};

function getStreamOptions(streams: StreamOption[], task?: TaskRow | null) {
  if (!task?.streamId || streams.some((stream) => stream.id === task.streamId)) {
    return streams;
  }

  return [
    ...streams,
    {
      id: task.streamId,
      name: task.streamName ?? "Текущий стрим",
      color: task.streamColor ?? "#77736a"
    }
  ];
}

function getProjectOptions(projects: ProjectOption[], task?: TaskRow | null) {
  if (!task?.projectId || projects.some((project) => project.id === task.projectId)) {
    return projects;
  }

  return [
    ...projects,
    {
      id: task.projectId,
      name: task.projectName ?? "Текущий проект",
      color: task.projectColor ?? "#77736a",
      streamId: task.streamId ?? "",
      streamName: task.streamName ?? "Без стрима"
    }
  ];
}

const recurringFrequencyOptions = [
  { value: "daily", label: "дней" },
  { value: "weekly", label: "недель" },
  { value: "monthly", label: "месяцев" }
];

export function TaskForm({
  defaultDueDate = null,
  defaultTimeBlockEnd = null,
  defaultTimeBlockStart = null,
  projects,
  returnTo = "/",
  streams,
  task
}: TaskFormProps) {
  const isEditing = Boolean(task);
  const action = isEditing ? updateTask : createTask;
  const streamOptions = getStreamOptions(streams, task);
  const projectOptions = getProjectOptions(projects, task);
  const dueDate = task ? task.dueDate : defaultDueDate;
  const timeBlockStart = task?.timeBlockStart ?? defaultTimeBlockStart;
  const timeBlockEnd = task?.timeBlockEnd ?? defaultTimeBlockEnd;
  const recurringToggleId = `make-recurring-${task?.id ?? "new"}`;

  return (
    <section className="panel task-form-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{isEditing ? "Редактирование" : "Новая задача"}</p>
          <h2>{isEditing ? "Карточка задачи" : "Полная форма"}</h2>
        </div>
      </div>

      <form action={action} className="task-form">
        {task ? <input name="taskId" type="hidden" value={task.id} /> : null}
        <input name="returnTo" type="hidden" value={returnTo} />

        <label className="field full-width">
          Название
          <input
            defaultValue={task?.title ?? ""}
            name="title"
            placeholder="Что нужно сделать?"
            required
          />
        </label>

        <label className="field full-width">
          Описание
          <textarea
            defaultValue={task?.description ?? ""}
            name="description"
            placeholder="Детали, ссылки, критерии"
            rows={4}
          />
        </label>

        <DueDateField defaultValue={dueDate ? formatDisplayDate(dueDate) : ""} />

        <label className="field">
          Приоритет дня
          <input
            defaultValue={task?.dayPriority ?? ""}
            min={1}
            name="dayPriority"
            placeholder="Авто"
            type="number"
          />
        </label>

        <TaskStatusCycle initialStatus={task?.status ?? "open"} />

        <div className="field">
          <span>Размер</span>
          <div className="size-options">
            {Object.entries(taskSizeLabels).map(([value, label]) => (
              <label className="size-option" key={value}>
                <input
                  defaultChecked={(task?.size ?? "medium") === value}
                  name="size"
                  type="radio"
                  value={value}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <TaskContextPicker
          projects={projectOptions}
          streams={streamOptions}
          task={task}
        />

        <div className="field-row full-width">
          <label className="field">
            Начало блока
            <input
              defaultValue={formatTimeInput(timeBlockStart)}
              name="timeBlockStart"
              type="time"
            />
          </label>
          <label className="field">
            Конец блока
            <input
              defaultValue={formatTimeInput(timeBlockEnd)}
              name="timeBlockEnd"
              type="time"
            />
          </label>
        </div>

        {isEditing ? (
          task?.recurringTaskId ? (
            <div className="recurring-existing full-width">
              <Repeat2 size={18} />
              <span>Повторяющаяся задача</span>
            </div>
          ) : (
            <div className="recurring-conversion full-width">
              <label className="recurring-toggle" htmlFor={recurringToggleId}>
                <input
                  className="recurring-toggle-input"
                  id={recurringToggleId}
                  name="makeRecurring"
                  type="checkbox"
                  value="true"
                />
                <span className="recurring-toggle-box">
                  <Repeat2 size={18} />
                </span>
                <span>Сделать повторяющейся</span>
              </label>

              <div className="recurring-fields">
                <label className="field">
                  Каждые
                  <input
                    defaultValue={1}
                    min={1}
                    name="recurringInterval"
                    type="number"
                  />
                </label>
                <label className="field">
                  Период
                  <select defaultValue="weekly" name="recurringFrequency">
                    {recurringFrequencyOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )
        ) : null}

        <button className="primary-button full-width" type="submit">
          {isEditing ? "Сохранить" : "Создать задачу"}
        </button>
      </form>
    </section>
  );
}
