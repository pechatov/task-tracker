import type { CSSProperties } from "react";
import { Archive, Plus, RotateCcw } from "lucide-react";
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
  type StreamRow
} from "@/lib/projects/data";

function StatusBadge({ status }: { status: ContextStatus }) {
  return (
    <span className={status === "active" ? "status-badge active" : "status-badge"}>
      {status === "active" ? "Активен" : "Завершен"}
    </span>
  );
}

function StatusButton({
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
      <button className="secondary-button compact-button" type="submit">
        <Icon size={15} />
        {status === "active" ? "Завершить" : "Вернуть"}
      </button>
    </form>
  );
}

function StreamItem({ stream }: { stream: StreamRow }) {
  return (
    <div className="context-row">
      <span
        className="color-dot"
        style={{ "--context-color": stream.color } as CSSProperties}
      />
      <div className="context-main">
        <strong>{stream.name}</strong>
        <StatusBadge status={stream.status} />
      </div>
      <StatusButton
        action={updateStreamStatus}
        entityId={stream.id}
        entityName="streamId"
        status={stream.status}
      />
    </div>
  );
}

function ProjectItem({ project }: { project: ProjectRow }) {
  return (
    <div className="context-row">
      <span
        className="color-dot"
        style={{ "--context-color": project.color } as CSSProperties}
      />
      <div className="context-main">
        <strong>{project.name}</strong>
        <span className="label-row">
          <StatusBadge status={project.status} />
          <span className="muted">{project.streamName}</span>
          {project.streamStatus === "completed" ? (
            <span className="muted">стрим завершен</span>
          ) : null}
        </span>
      </div>
      <StatusButton
        action={updateProjectStatus}
        entityId={project.id}
        entityName="projectId"
        status={project.status}
      />
    </div>
  );
}

export default async function ProjectsPage() {
  const data = await getProjectsData();

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Projects / Streams</p>
          <h1>Классификация задач</h1>
        </div>
      </header>

      <section className="two-column">
        <div className="panel">
          <div className="panel-heading">
            <h2>Стримы</h2>
          </div>
          <form action={createStream} className="management-form">
            <label className="field">
              Название
              <input name="name" placeholder="Работа" required />
            </label>
            <button className="primary-button" type="submit">
              <Plus size={16} />
              Создать стрим
            </button>
          </form>
          <div className="context-list">
            {data.streams.length === 0 ? (
              <p className="empty-state">Стримов пока нет.</p>
            ) : null}
            {data.streams.map((stream) => (
              <StreamItem key={stream.id} stream={stream} />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Проекты</h2>
          </div>
          <form action={createProject} className="management-form">
            <label className="field">
              Название
              <input name="name" placeholder="Task Tracker" required />
            </label>
            <label className="field">
              Стрим
              <select name="streamId" required defaultValue="">
                <option value="" disabled>
                  Выберите стрим
                </option>
                {data.activeStreams.map((stream) => (
                  <option key={stream.id} value={stream.id}>
                    {stream.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              disabled={data.activeStreams.length === 0}
              type="submit"
            >
              <Plus size={16} />
              Создать проект
            </button>
          </form>
          <div className="context-list">
            {data.projects.length === 0 ? (
              <p className="empty-state">Проектов пока нет.</p>
            ) : null}
            {data.projects.map((project) => (
              <ProjectItem key={project.id} project={project} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
