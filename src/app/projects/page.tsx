const streams = [
  { name: "Работа", color: "#2d7dd2", status: "активен" },
  { name: "Дом", color: "#e56b6f", status: "активен" },
  { name: "Учеба", color: "#6b8e23", status: "завершен" }
];

const projects = [
  { name: "Task Tracker", stream: "Работа", color: "#2d7dd2", status: "активен" },
  { name: "Интеграции", stream: "Работа", color: "#6b8e23", status: "активен" }
];

export default function ProjectsPage() {
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
            <button className="secondary-button" type="button">Новый</button>
          </div>
          <div className="simple-list">
            {streams.map((stream) => (
              <div className="simple-row" key={stream.name}>
                <span className="color-dot" style={{ background: stream.color }} />
                <strong>{stream.name}</strong>
                <span className="muted">{stream.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Проекты</h2>
            <button className="secondary-button" type="button">Новый</button>
          </div>
          <div className="simple-list">
            {projects.map((project) => (
              <div className="simple-row" key={project.name}>
                <span className="color-dot" style={{ background: project.color }} />
                <strong>{project.name}</strong>
                <span className="muted">{project.stream}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
