import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  FolderKanban,
  FolderOpen,
  Pencil,
  Plus,
  X
} from "lucide-react";
import { deleteTask } from "@/app/actions/tasks";
import {
  createProject,
  createStream,
  updateProject,
  updateStream
} from "@/app/actions/projects";
import { TaskForm } from "@/components/task-form";
import { TaskTitle } from "@/components/task-title";
import { formatDisplayDate, formatDisplayTime } from "@/lib/date";
import {
  getProjectsData,
  type ProjectDetails,
  type ProjectRow,
  type StreamGroup
} from "@/lib/projects/data";
import { taskSizeLabels } from "@/lib/tasks/size";

export const dynamic = "force-dynamic";

type ProjectsPageProps = {
  searchParams: Promise<{
    editProject?: string | string[];
    editStream?: string | string[];
    projectId?: string | string[];
    taskId?: string | string[];
  }>;
};

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function ProjectItem({ project }: { project: ProjectRow }) {
  return (
    <div
      className={
        project.status === "active" ? "project-row" : "project-row completed"
      }
    >
      <Link
        className="project-row-link"
        href={`/projects?projectId=${project.id}`}
        title={`Открыть проект ${project.name}`}
      >
        <span className="project-row-main">
          <span
            className="color-dot"
            style={{ "--context-color": project.color } as CSSProperties}
          />
          <span className="project-row-name">{project.name}</span>
        </span>
        {project.status === "active" ? (
          <span className="counter" title="Открытые задачи">
            {project.openTaskCount}
          </span>
        ) : (
          <span className="status-badge">Завершен</span>
        )}
      </Link>
      <Link
        aria-label={`Редактировать проект ${project.name}`}
        className="icon-button"
        href={`/projects?editProject=${project.id}`}
        title="Редактировать"
      >
        <Pencil size={15} />
      </Link>
    </div>
  );
}

type ProjectTask = ProjectDetails["openTasks"][number];

function getTaskScheduleLabel(task: ProjectTask) {
  if (!task.dueDate) {
    return "Без даты";
  }

  if (task.timeBlockStart && task.timeBlockEnd) {
    return `${formatDisplayDate(task.dueDate)}, ${formatDisplayTime(
      task.timeBlockStart
    )}-${formatDisplayTime(task.timeBlockEnd)}`;
  }

  if (task.timeBlockStart) {
    return `${formatDisplayDate(task.dueDate)}, ${formatDisplayTime(
      task.timeBlockStart
    )}`;
  }

  return formatDisplayDate(task.dueDate);
}

function ProjectTaskRow({
  projectId,
  task
}: {
  projectId: string;
  task: ProjectTask;
}) {
  const isDone = task.status === "done";

  return (
    <Link
      className={isDone ? "project-task-row done" : "project-task-row"}
      href={`/projects?projectId=${projectId}&taskId=${task.id}`}
    >
      <span className="project-task-status" aria-hidden="true">
        {isDone ? <CheckCircle2 size={17} /> : <Circle size={17} />}
      </span>
      <span className="task-main">
        <TaskTitle task={task} />
        <span className="task-meta-row">
          <span className={task.dueDate ? "date-chip" : "status-badge"}>
            {getTaskScheduleLabel(task)}
          </span>
          <span className="muted">{taskSizeLabels[task.size]}</span>
        </span>
      </span>
    </Link>
  );
}

function ProjectTaskList({
  emptyText,
  icon,
  projectId,
  tasks,
  title
}: {
  emptyText: string;
  icon: ReactNode;
  projectId: string;
  tasks: ProjectTask[];
  title: string;
}) {
  return (
    <section className="project-task-section">
      <div className="project-task-section-header">
        <span>
          {icon}
          {title}
        </span>
        <span className="counter">{tasks.length}</span>
      </div>
      <div className="project-task-list">
        {tasks.length === 0 ? <p className="empty-state">{emptyText}</p> : null}
        {tasks.map((task) => (
          <ProjectTaskRow key={task.id} projectId={projectId} task={task} />
        ))}
      </div>
    </section>
  );
}

function ProjectDetailsModal({ project }: { project: ProjectDetails }) {
  return (
    <div className="modal-backdrop">
      <section className="task-modal project-details-modal">
        <div className="modal-header">
          <Link className="icon-button" href="/projects" aria-label="Закрыть">
            <X size={18} />
          </Link>
        </div>
        <div className="project-details-body">
          <div className="project-details-heading">
            <span
              className="color-dot"
              style={{ "--context-color": project.color } as CSSProperties}
            />
            <div>
              <p className="eyebrow">Проект</p>
              <h2>{project.name}</h2>
              <p className="muted">Стрим: {project.streamName}</p>
            </div>
            <FolderOpen size={22} />
          </div>
          <div className="project-details-summary">
            <span className="status-badge active">
              Открытых: {project.openTasks.length}
            </span>
            <span className="status-badge">
              Завершенных: {project.doneTasks.length}
            </span>
          </div>
          <div className="project-task-columns">
            <ProjectTaskList
              emptyText="Открытых задач в проекте нет."
              icon={<Circle size={16} />}
              projectId={project.id}
              tasks={project.openTasks}
              title="Открытые задачи"
            />
            <ProjectTaskList
              emptyText="Завершенных задач в проекте нет."
              icon={<CheckCircle2 size={16} />}
              projectId={project.id}
              tasks={project.doneTasks}
              title="Завершенные задачи"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function StreamCard({ stream }: { stream: StreamGroup }) {
  return (
    <section
      className={
        stream.status === "active"
          ? "panel stream-card"
          : "panel stream-card completed"
      }
      style={{ "--context-color": stream.color } as CSSProperties}
    >
      <div className="stream-card-header">
        <span className="color-dot" />
        <div className="stream-card-title">
          <h2>{stream.name}</h2>
          <p className="muted">
            {stream.status === "active"
              ? `Открытых задач: ${stream.openTaskCount}`
              : "Стрим завершен"}
          </p>
        </div>
        <Link
          aria-label={`Редактировать стрим ${stream.name}`}
          className="icon-button"
          href={`/projects?editStream=${stream.id}`}
          title="Редактировать"
        >
          <Pencil size={15} />
        </Link>
      </div>

      <div className="stream-card-projects">
        {stream.projects.length === 0 ? (
          <p className="empty-state">Проектов пока нет.</p>
        ) : null}
        {stream.projects.map((project) => (
          <ProjectItem key={project.id} project={project} />
        ))}
      </div>

      {stream.status === "active" ? (
        <form action={createProject} className="inline-create-form">
          <input name="streamId" type="hidden" value={stream.id} />
          <input
            aria-label={`Новый проект в стриме ${stream.name}`}
            name="name"
            placeholder="Новый проект"
            required
          />
          <button
            aria-label="Создать проект"
            className="secondary-button"
            type="submit"
          >
            <Plus size={16} />
          </button>
        </form>
      ) : null}
    </section>
  );
}

function EditStreamModal({ stream }: { stream: StreamGroup }) {
  return (
    <div className="modal-backdrop">
      <section className="task-modal context-modal">
        <div className="modal-header">
          <Link className="icon-button" href="/projects" aria-label="Закрыть">
            <X size={18} />
          </Link>
        </div>
        <form action={updateStream} className="context-edit-form">
          <input name="streamId" type="hidden" value={stream.id} />
          <div>
            <p className="eyebrow">Стрим</p>
            <h2>Редактирование стрима</h2>
          </div>
          <label className="field">
            Название
            <input name="name" required defaultValue={stream.name} />
          </label>
          <label className="field">
            Цвет
            <input name="color" type="color" defaultValue={stream.color} />
          </label>
          <label className="context-status-toggle">
            <input
              defaultChecked={stream.status === "completed"}
              name="status"
              type="checkbox"
              value="completed"
            />
            Завершен
          </label>
          <div className="context-edit-actions">
            <Link className="secondary-button" href="/projects">
              Отмена
            </Link>
            <button className="primary-button" type="submit">
              Сохранить
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function EditProjectModal({ project }: { project: ProjectRow }) {
  return (
    <div className="modal-backdrop">
      <section className="task-modal context-modal">
        <div className="modal-header">
          <Link className="icon-button" href="/projects" aria-label="Закрыть">
            <X size={18} />
          </Link>
        </div>
        <form action={updateProject} className="context-edit-form">
          <input name="projectId" type="hidden" value={project.id} />
          <div>
            <p className="eyebrow">Проект</p>
            <h2>Редактирование проекта</h2>
            <p className="muted">Стрим: {project.streamName}</p>
          </div>
          <label className="field">
            Название
            <input name="name" required defaultValue={project.name} />
          </label>
          <label className="field">
            Цвет
            <input name="color" type="color" defaultValue={project.color} />
          </label>
          <label className="context-status-toggle">
            <input
              defaultChecked={project.status === "completed"}
              name="status"
              type="checkbox"
              value="completed"
            />
            Завершен
          </label>
          <div className="context-edit-actions">
            <Link className="secondary-button" href="/projects">
              Отмена
            </Link>
            <button className="primary-button" type="submit">
              Сохранить
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function EditTaskModal({
  projects,
  projectId,
  streams,
  task
}: {
  projects: Parameters<typeof TaskForm>[0]["projects"];
  projectId: string;
  streams: Parameters<typeof TaskForm>[0]["streams"];
  task: ProjectTask;
}) {
  const returnTo = `/projects?projectId=${projectId}` as const;

  return (
    <div className="modal-backdrop nested-modal-backdrop">
      <section className="task-modal">
        <div className="modal-header">
          <Link
            className="icon-button"
            href={returnTo}
            aria-label="Закрыть задачу"
          >
            <X size={18} />
          </Link>
        </div>
        <TaskForm
          projects={projects}
          returnTo={returnTo}
          streams={streams}
          task={task}
        />
        <form action={deleteTask} className="delete-form">
          <input name="taskId" type="hidden" value={task.id} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <button className="danger-button" type="submit">
            Удалить задачу
          </button>
        </form>
      </section>
    </div>
  );
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const params = await searchParams;
  const viewProjectId = getFirst(params.projectId);
  const taskId = getFirst(params.taskId);
  const data = await getProjectsData(viewProjectId, taskId);
  const activeStreams = data.streamGroups.filter(
    (stream) => stream.status === "active"
  );
  const completedStreams = data.streamGroups.filter(
    (stream) => stream.status === "completed"
  );
  const editStreamId = getFirst(params.editStream);
  const editProjectId = getFirst(params.editProject);
  const selectedStream = editStreamId
    ? data.streamGroups.find((stream) => stream.id === editStreamId)
    : null;
  const selectedProject = editProjectId
    ? data.streamGroups
        .flatMap((stream) => stream.projects)
        .find((project) => project.id === editProjectId)
    : null;
  const selectedProjectDetails =
    editProjectId || editStreamId ? null : data.selectedProject;
  const selectedTask =
    selectedProjectDetails &&
    data.selectedTask &&
    data.selectedTask.projectId === viewProjectId
      ? data.selectedTask
      : null;

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Projects / Streams</p>
          <h1>Классификация задач</h1>
        </div>
        <form action={createStream} className="inline-create-form stream-create-form">
          <input
            aria-label="Название нового стрима"
            name="name"
            placeholder="Новый стрим"
            required
          />
          <button className="primary-button" type="submit">
            <Plus size={16} />
            Создать стрим
          </button>
        </form>
      </header>

      {data.streamGroups.length === 0 ? (
        <section className="panel projects-empty">
          <FolderKanban size={28} />
          <div>
            <h2>Начните со стрима</h2>
            <p className="muted">
              Стрим — это направление работы, внутри которого живут проекты.
              Создайте первый стрим, чтобы классифицировать задачи.
            </p>
          </div>
        </section>
      ) : null}

      <section className="stream-grid">
        {activeStreams.map((stream) => (
          <StreamCard key={stream.id} stream={stream} />
        ))}
      </section>

      {completedStreams.length > 0 ? (
        <>
          <h2 className="section-title">Завершенные стримы</h2>
          <section className="stream-grid">
            {completedStreams.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
          </section>
        </>
      ) : null}

      {selectedStream ? <EditStreamModal stream={selectedStream} /> : null}
      {selectedProject ? <EditProjectModal project={selectedProject} /> : null}
      {selectedProjectDetails ? (
        <ProjectDetailsModal project={selectedProjectDetails} />
      ) : null}
      {selectedTask && viewProjectId ? (
        <EditTaskModal
          projects={data.activeProjects}
          projectId={viewProjectId}
          streams={data.activeStreams}
          task={selectedTask}
        />
      ) : null}
    </main>
  );
}
