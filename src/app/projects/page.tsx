import type { CSSProperties } from "react";
import Link from "next/link";
import { FolderKanban, Pencil, Plus, X } from "lucide-react";
import {
  createProject,
  createStream,
  updateProject,
  updateStream,
} from "@/app/actions/projects";
import {
  getProjectsData,
  type ProjectRow,
  type StreamGroup
} from "@/lib/projects/data";

type ProjectsPageProps = {
  searchParams: Promise<{
    editProject?: string | string[];
    editStream?: string | string[];
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

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const data = await getProjectsData();
  const params = await searchParams;
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
    </main>
  );
}
