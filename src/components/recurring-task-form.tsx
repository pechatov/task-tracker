import {
  createRecurringTask,
  updateRecurringTask
} from "@/app/actions/recurring-tasks";
import { DueDateField } from "@/components/due-date-field";
import { TaskContextPicker } from "@/components/task-context-picker";
import { formatDisplayDate } from "@/lib/date";
import {
  formatMinutesAsTime,
  getDayOfMonth,
  getDayOfWeek
} from "@/lib/recurring-tasks/schedule";
import type {
  RecurringTaskRow
} from "@/lib/recurring-tasks/data";
import type {
  ProjectOption,
  StreamOption
} from "@/lib/tasks/data";
import { taskSizeLabels } from "@/lib/tasks/size";

type RecurringTaskFormProps = {
  defaultStartDate: string;
  projects: ProjectOption[];
  streams: StreamOption[];
  task?: RecurringTaskRow | null;
};

const frequencyOptions = [
  { value: "daily", label: "День" },
  { value: "weekly", label: "Неделя" },
  { value: "monthly", label: "Месяц" }
];

const weekdayOptions = [
  { value: 1, label: "Понедельник" },
  { value: 2, label: "Вторник" },
  { value: 3, label: "Среда" },
  { value: 4, label: "Четверг" },
  { value: 5, label: "Пятница" },
  { value: 6, label: "Суббота" },
  { value: 0, label: "Воскресенье" }
];

function getStreamOptions(streams: StreamOption[], task?: RecurringTaskRow | null) {
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

function getProjectOptions(
  projects: ProjectOption[],
  task?: RecurringTaskRow | null
) {
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

export function RecurringTaskForm({
  defaultStartDate,
  projects,
  streams,
  task
}: RecurringTaskFormProps) {
  const isEditing = Boolean(task);
  const action = isEditing ? updateRecurringTask : createRecurringTask;
  const startDate = task?.startDate ?? defaultStartDate;
  const streamOptions = getStreamOptions(streams, task);
  const projectOptions = getProjectOptions(projects, task);
  const dayOfWeek =
    task?.dayOfWeek ?? (startDate ? getDayOfWeek(startDate) : 1);
  const dayOfMonth =
    task?.dayOfMonth ?? (startDate ? getDayOfMonth(startDate) : 1);

  return (
    <section className="panel task-form-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">
            {isEditing ? "Редактирование" : "Новая повторяющаяся"}
          </p>
          <h2>{isEditing ? "Шаблон задачи" : "Повторяющаяся задача"}</h2>
        </div>
      </div>

      <form action={action} className="task-form">
        {task ? (
          <input name="recurringTaskId" type="hidden" value={task.id} />
        ) : null}

        <label className="field full-width">
          Название
          <input
            defaultValue={task?.title ?? ""}
            name="title"
            placeholder="Например, тренировка по теннису"
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

        <div className="field-row full-width">
          <DueDateField
            defaultValue={formatDisplayDate(startDate)}
            label="Дата старта"
            name="startDate"
            placeholder="Дата первого повтора"
          />
          <DueDateField
            defaultValue={task?.endDate ? formatDisplayDate(task.endDate) : ""}
            label="Дата окончания"
            name="endDate"
            placeholder="Без окончания"
          />
        </div>

        <label className="field">
          Повтор
          <select defaultValue={task?.frequency ?? "weekly"} name="frequency">
            {frequencyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Интервал
          <input
            defaultValue={task?.interval ?? 1}
            min={1}
            name="interval"
            type="number"
          />
        </label>

        <label className="field">
          День недели
          <select defaultValue={dayOfWeek} name="dayOfWeek">
            {weekdayOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          День месяца
          <input
            defaultValue={dayOfMonth}
            max={31}
            min={1}
            name="dayOfMonth"
            type="number"
          />
        </label>

        <label className="field">
          Приоритет дня
          <input
            defaultValue={task?.dayPriority ?? 1}
            min={1}
            name="dayPriority"
            type="number"
          />
        </label>

        <div className="field">
          <span>Состояние</span>
          <div className="size-options recurrence-status-options">
            {[
              { value: "active", label: "Активна" },
              { value: "paused", label: "Пауза" }
            ].map((option) => (
              <label className="size-option" key={option.value}>
                <input
                  defaultChecked={(task?.status ?? "active") === option.value}
                  name="status"
                  type="radio"
                  value={option.value}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

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
              defaultValue={formatMinutesAsTime(
                task?.timeBlockStartMinutes ?? null
              )}
              inputMode="numeric"
              name="timeBlockStart"
              pattern="[0-9]{2}:[0-9]{2}"
              placeholder="HH:mm"
              type="text"
            />
          </label>
          <label className="field">
            Конец блока
            <input
              defaultValue={formatMinutesAsTime(task?.timeBlockEndMinutes ?? null)}
              inputMode="numeric"
              name="timeBlockEnd"
              pattern="[0-9]{2}:[0-9]{2}"
              placeholder="HH:mm"
              type="text"
            />
          </label>
        </div>

        <button className="primary-button full-width" type="submit">
          {isEditing ? "Сохранить шаблон" : "Создать повторение"}
        </button>
      </form>
    </section>
  );
}
