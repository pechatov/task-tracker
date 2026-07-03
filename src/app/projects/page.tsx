import type { CSSProperties } from "react";
import { Archive, FolderKanban, Plus, RotateCcw } from "lucide-react";
import {
  createProject,
  createStream,
  updateProjectStatus,
  updateStreamStatus
} from "@/app/actions/projects";
import {
  getProjectsData,
  type ContextStatus,
  type ProjectRow,
  type StreamGroup
} from "@/lib/projects/data";

function StatusToggle({
  action,
  entityId,
  entityName,
  status
}: {
  action: typeof updateStreamStatus | typeof updateProjectStatus;
  entityId: string;
  entityName: "streamId" | "projectId";
  status: ContextStatus;
}) {
  const nextStatus = status === "active" ? "completed" : "active";
  const Icon = status === "active" ? Archive : RotateCcw;

  return (
    <form action={action}>
      <input name={entityName} type="hidden" value={entityId} />
      <input name="status" type="hidden" value={nextStatus} />
      <button
        aria-label={status === "active" ? "Завершить" : "Вернуть в работу"}
        className="icon-button"
        title={status === "active" ? "Завершить" : "Вернуть в работу"}
        type="submit"
      >
        <Icon size={15} />
      </button>
    </form>
  );
}

function ProjectItem({ project }: { project: ProjectRow }) {
  return (
    <div
      className={
        project.status === "active" ? "project-row" : "project-row completed"
      }
    >
      <span
        className="color-dot"
        style={{ "--context-color": project.color } as CSSProperties}
      />
      <span className="project-row-name">{project.name}</span>
      {project.status === "active" ? (
        <span className="counter" title="Открытые задачи">
          {project.openTaskCount}
        </span>
      ) : (
        <span className="status-badge">Завершен</span>
      )}
      <StatusToggle
        action={updateProjectStatus}
        entityId={project.id}
        entityName="projectId"
        status={project.status}
      />
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
        <StatusToggle
          action={updateStreamStatus}
          entityId={stream.id}
          entityName="streamId"
          status={stream.status}
        />
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

export default async function ProjectsPage() {
  const data = await getProjectsData();
  const activeStreams = data.streamGroups.filter(
    (stream) => stream.status === "active"
  );
  const completedStreams = data.streamGroups.filter(
    (stream) => stream.status === "completed"
  );

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
    </main>
  );
}
