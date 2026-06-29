import type { CSSProperties } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FolderKanban,
  Plus,
  Save,
  Settings,
  SunMedium
} from "lucide-react";
import { themeOptions } from "@/lib/themes";

type ThemeOption = {
  id: string;
  name: string;
  title: string;
  summary: string;
  swatches: string[];
};

const themes: ThemeOption[] = themeOptions.map((theme, index) => ({
  id: theme.id,
  name: String(index + 1).padStart(2, "0"),
  title: theme.name,
  summary: theme.description,
  swatches: [...theme.swatches]
}));

const tasks = [
  {
    priority: 1,
    title: "Разобрать inbox и выбрать 3 задачи дня",
    project: "Task Tracker",
    stream: "Работа",
    projectColor: "#78dce8",
    streamColor: "#a6e22e"
  },
  {
    priority: 2,
    title: "Подготовить подключение календарей",
    project: "Интеграции",
    stream: "Работа",
    projectColor: "#ab9df2",
    streamColor: "#a6e22e"
  },
  {
    priority: 3,
    title: "Оплатить счета и обновить план недели",
    project: "Дом",
    stream: "Личное",
    projectColor: "#ffd866",
    streamColor: "#ff6188"
  }
];

const timeline = [
  {
    time: "09:30",
    title: "Focus block: calendar sync",
    source: "Задача с временным блоком",
    color: "#78dce8",
    external: false
  },
  {
    time: "11:00",
    title: "Product sync",
    source: "Рабочий календарь",
    color: "#ab9df2",
    external: true
  },
  {
    time: "15:30",
    title: "Review schema decisions",
    source: "Задача с проектом",
    color: "#a6e22e",
    external: false
  }
];

function Swatches({ colors }: { colors: string[] }) {
  return (
    <div className="theme-swatches" aria-hidden="true">
      {colors.map((color) => (
        <span key={color} style={{ background: color }} />
      ))}
    </div>
  );
}

function Label({ color, children }: { color: string; children: string }) {
  return (
    <span
      className="preview-label"
      style={{ "--preview-label-color": color } as CSSProperties}
    >
      {children}
    </span>
  );
}

function ThemePreview({ theme }: { theme: ThemeOption }) {
  return (
    <section className={`theme-preview theme-${theme.id}`}>
      <div className="theme-meta">
        <div>
          <p className="theme-kicker">Вариант {theme.name}</p>
          <h2>{theme.title}</h2>
          <p>{theme.summary}</p>
        </div>
        <Swatches colors={theme.swatches} />
      </div>

      <div className="preview-browser">
        <aside className="preview-sidebar">
          <div className="preview-brand">
            <span>TT</span>
            <strong>Task Tracker</strong>
          </div>
          <nav className="preview-nav" aria-label={`${theme.title} navigation preview`}>
            <span className="active">
              <SunMedium size={16} />
              Today
            </span>
            <span>
              <CalendarClock size={16} />
              Calendar
            </span>
            <span>
              <FolderKanban size={16} />
              Projects
            </span>
            <span>
              <Settings size={16} />
              Settings
            </span>
          </nav>
        </aside>

        <div className="preview-main">
          <header className="preview-header-row">
            <div>
              <p className="preview-eyebrow">Today</p>
              <h3>План дня</h3>
              <p className="preview-muted">29 июня 2026</p>
            </div>
            <span className="preview-sync">
              <CheckCircle2 size={15} />
              База готова
            </span>
          </header>

          <section className="preview-layout">
            <div className="preview-panel preview-form-panel">
              <div className="preview-panel-heading">
                <div>
                  <p className="preview-eyebrow">Новая задача</p>
                  <h4>Полная форма</h4>
                </div>
                <Plus size={18} />
              </div>
              <div className="preview-form-grid">
                <label>
                  Название
                  <span>Сверстать темную тему</span>
                </label>
                <label>
                  Описание
                  <span>Проверить Today, Calendar, Projects и Settings</span>
                </label>
                <label>
                  Дата
                  <span>2026-06-29</span>
                </label>
                <label>
                  Приоритет
                  <span>1</span>
                </label>
              </div>
              <button className="preview-primary-button" type="button">
                <Save size={15} />
                Создать задачу
              </button>
            </div>

            <div className="preview-stack">
              <div className="preview-panel">
                <div className="preview-panel-heading">
                  <div>
                    <p className="preview-eyebrow">Задачи дня</p>
                    <h4>Открытые задачи</h4>
                  </div>
                  <span className="preview-counter">3</span>
                </div>
                <div className="preview-list">
                  {tasks.map((task) => (
                    <div className="preview-task-row" key={task.title}>
                      <span className="preview-priority">{task.priority}</span>
                      <span className="preview-task-main">
                        <strong>{task.title}</strong>
                        <span className="preview-label-row">
                          <Label color={task.projectColor}>{task.project}</Label>
                          <Label color={task.streamColor}>{task.stream}</Label>
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="preview-panel">
                <div className="preview-panel-heading">
                  <div>
                    <p className="preview-eyebrow">Сегодня по времени</p>
                    <h4>Встречи и блоки</h4>
                  </div>
                  <CalendarClock size={18} />
                </div>
                <div className="preview-list">
                  {timeline.map((item) => (
                    <div className="preview-timeline-row" key={`${item.time}-${item.title}`}>
                      <span className="preview-time">{item.time}</span>
                      <span
                        className="preview-event-marker"
                        style={{ "--preview-event-color": item.color } as CSSProperties}
                      />
                      <span className="preview-task-main">
                        <strong>
                          {item.title}
                          {item.external ? <ExternalLink size={13} /> : null}
                        </strong>
                        <span className="preview-muted">{item.source}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="preview-panel preview-attention">
                <div className="preview-panel-heading">
                  <div>
                    <p className="preview-eyebrow">Просроченные</p>
                    <h4>Нужно перенести</h4>
                  </div>
                  <AlertTriangle size={18} />
                </div>
                <div className="preview-overdue-row">
                  <span>
                    <strong>Ответить по старому PR</strong>
                    <span className="preview-muted">Дата выполнения: 28 июня 2026</span>
                  </span>
                  <button className="preview-secondary-button" type="button">
                    <Clock3 size={14} />
                    На сегодня
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

export default function DesignPreviewPage() {
  return (
    <main className="design-preview-page">
      <header className="design-preview-header">
        <p className="theme-kicker">Task Tracker design preview</p>
        <h1>Сравнение тем</h1>
        <p>
          Одинаковый фрагмент продукта во всех доступных цветовых схемах. Смотри на
          читаемость задач, спокойствие панелей, заметность календарных маркеров
          и то, насколько активные элементы отвлекают от плана дня.
        </p>
      </header>

      <div className="theme-grid">
        {themes.map((theme) => (
          <ThemePreview key={theme.id} theme={theme} />
        ))}
      </div>
    </main>
  );
}
