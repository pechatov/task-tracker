import { createTask, updateTask } from "@/app/actions/tasks";
import { formatTimeInput } from "@/lib/date";
import type {
  ProjectOption,
  StreamOption,
  TaskRow
} from "@/lib/tasks/data";
import { taskStatusLabels } from "@/lib/tasks/status";

type TaskFormProps = {
  defaultDueDate: string;
  projects: ProjectOption[];
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

export function TaskForm({
  defaultDueDate,
  projects,
  streams,
  task
}: TaskFormProps) {
  const isEditing = Boolean(task);
  const action = isEditing ? updateTask : createTask;
  const streamOptions = getStreamOptions(streams, task);
  const projectOptions = getProjectOptions(projects, task);

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

        <label className="field">
          Дата выполнения
          <input
            defaultValue={task?.dueDate ?? defaultDueDate}
            name="dueDate"
            required
            type="date"
          />
        </label>

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

        <label className="field">
          Состояние
          <select defaultValue={task?.status ?? "open"} name="status">
            {Object.entries(taskStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Стрим
          <select defaultValue={task?.streamId ?? ""} name="streamId">
            <option value="">Без стрима</option>
            {streamOptions.map((stream) => (
              <option key={stream.id} value={stream.id}>
                {stream.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Проект
          <select defaultValue={task?.projectId ?? ""} name="projectId">
            <option value="">Без проекта</option>
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} · {project.streamName}
              </option>
            ))}
          </select>
        </label>

        <div className="field-row full-width">
          <label className="field">
            Начало блока
            <input
              defaultValue={formatTimeInput(task?.timeBlockStart ?? null)}
              name="timeBlockStart"
              type="time"
            />
          </label>
          <label className="field">
            Конец блока
            <input
              defaultValue={formatTimeInput(task?.timeBlockEnd ?? null)}
              name="timeBlockEnd"
              type="time"
            />
          </label>
        </div>

        <details className="inline-create full-width">
          <summary>Создать стрим или проект inline</summary>
          <div className="inline-create-grid">
            <label className="field">
              Новый стрим
              <input name="newStreamName" placeholder="Например: Работа" />
            </label>
            <label className="field">
              Цвет стрима
              <input defaultValue="#2d7dd2" name="newStreamColor" type="color" />
            </label>
            <label className="field">
              Новый проект
              <input name="newProjectName" placeholder="Например: Task Tracker" />
            </label>
            <label className="field">
              Цвет проекта
              <input defaultValue="#6b8e23" name="newProjectColor" type="color" />
            </label>
          </div>
          <p className="muted">
            Новый проект будет создан внутри выбранного или нового стрима.
          </p>
        </details>

        <button className="primary-button full-width" type="submit">
          {isEditing ? "Сохранить" : "Создать задачу"}
        </button>
      </form>
    </section>
  );
}
