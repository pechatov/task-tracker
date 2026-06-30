import type { CSSProperties } from "react";
import {
  CalendarCheck2,
  Link as LinkIcon,
  Palette,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Type
} from "lucide-react";
import {
  connectYandexCalendar,
  disconnectCalendarSource,
  syncCalendarSourceAction,
  toggleConnectedCalendar
} from "@/app/actions/calendar";
import { FontSelector } from "@/components/font-selector";
import { ThemeSelector } from "@/components/theme-selector";
import { requireCurrentUser } from "@/lib/auth/session";
import { getCalendarSettingsData } from "@/lib/calendar/settings-data";
import { formatDisplayDate, formatDisplayTime } from "@/lib/date";

type SettingsPageProps = {
  searchParams: Promise<{
    calendarError?: string | string[];
    calendarStatus?: string | string[];
  }>;
};

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatSyncTime(value: string | null) {
  if (!value) {
    return "Еще не синхронизировался";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Еще не синхронизировался";
  }

  return `${formatDisplayDate(date)} ${formatDisplayTime(date)}`;
}

function getCalendarMessage(params: Awaited<SettingsPageProps["searchParams"]>) {
  const error = getFirst(params.calendarError);
  const status = getFirst(params.calendarStatus);

  if (status === "connected") {
    return {
      className: "settings-message success",
      text: "Календарь подключен и первая синхронизация запущена."
    };
  }

  if (error === "microsoft_not_configured") {
    return {
      className: "settings-message error",
      text: "Microsoft OAuth не настроен в переменных окружения."
    };
  }

  if (error) {
    return {
      className: "settings-message error",
      text: "Не удалось подключить календарь. Проверьте доступы и попробуйте еще раз."
    };
  }

  return null;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const data = await getCalendarSettingsData();
  const message = getCalendarMessage(params);

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Интеграции, доступ и дизайн</h1>
        </div>
      </header>

      <section className="settings-grid">
        <div className="panel settings-panel">
          <div className="panel-heading">
            <h2>Календари</h2>
            <RefreshCw size={18} />
          </div>

          {message ? <p className={message.className}>{message.text}</p> : null}

          <div className="settings-row">
            <div>
              <strong>Microsoft 365 / Exchange</strong>
              <p>Read-only sync, окно берется из настроек синхронизации</p>
            </div>
            {data.isMicrosoftConfigured ? (
              <a className="secondary-button" href="/api/calendar/microsoft/start">
                <LinkIcon size={16} />
                Подключить
              </a>
            ) : (
              <a
                className="secondary-button"
                href="/settings?calendarError=microsoft_not_configured"
              >
                <LinkIcon size={16} />
                Подключить
              </a>
            )}
          </div>

          <form action={connectYandexCalendar} className="settings-form">
            <div className="settings-form-heading">
              <div>
                <strong>Яндекс.Календарь</strong>
                <p>CalDAV, пароль лучше брать из паролей приложений Яндекса</p>
              </div>
              <CalendarCheck2 size={18} />
            </div>
            <label className="field full-width">
              CalDAV URL
              <input
                defaultValue="https://caldav.yandex.ru"
                name="serverUrl"
                required
                type="url"
              />
            </label>
            <label className="field">
              Логин
              <input name="username" required type="email" />
            </label>
            <label className="field">
              Пароль
              <input name="password" required type="password" />
            </label>
            <button className="primary-button full-width" type="submit">
              Подключить Яндекс
            </button>
          </form>

          <div className="calendar-source-list">
            {data.sources.length === 0 ? (
              <p className="empty-state">Подключенных календарей пока нет.</p>
            ) : null}

            {data.sources.map((source) => (
              <section className="calendar-source" key={source.id}>
                <div className="calendar-source-header">
                  <div>
                    <strong>{source.displayName}</strong>
                    <p>
                      {source.providerLabel}
                      {source.accountEmail ? ` · ${source.accountEmail}` : ""}
                    </p>
                    <p>{formatSyncTime(source.lastSyncedAt)}</p>
                  </div>
                  <div className="calendar-source-actions">
                    <form action={syncCalendarSourceAction}>
                      <input name="sourceId" type="hidden" value={source.id} />
                      <button
                        aria-label="Синхронизировать"
                        className="icon-button"
                        disabled={source.status !== "active"}
                        type="submit"
                      >
                        <RefreshCw size={16} />
                      </button>
                    </form>
                    <form action={disconnectCalendarSource}>
                      <input name="sourceId" type="hidden" value={source.id} />
                      <button
                        aria-label="Отключить"
                        className="icon-button danger-icon"
                        type="submit"
                      >
                        <Trash2 size={16} />
                      </button>
                    </form>
                  </div>
                </div>

                <div className="connected-calendar-list">
                  {source.calendars.length === 0 ? (
                    <p className="empty-state">Календари еще не найдены.</p>
                  ) : null}
                  {source.calendars.map((calendar) => (
                    <form
                      action={toggleConnectedCalendar}
                      className="connected-calendar-row"
                      key={calendar.id}
                    >
                      <input name="calendarId" type="hidden" value={calendar.id} />
                      <label>
                        <input
                          defaultChecked={calendar.isEnabled}
                          name="isEnabled"
                          type="checkbox"
                        />
                        <span
                          className="color-dot"
                          style={
                            { "--context-color": calendar.color } as CSSProperties
                          }
                        />
                        <span>
                          {calendar.name}
                          {calendar.isPrimary ? " · основной" : ""}
                        </span>
                      </label>
                      <button className="secondary-button compact-button" type="submit">
                        Сохранить
                      </button>
                    </form>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Доступ</h2>
            <ShieldCheck size={18} />
          </div>
          <div className="settings-row">
            <div>
              <strong>{user.displayName ?? user.email}</strong>
              <p>{user.email}</p>
            </div>
            <form action="/logout" method="post">
              <button className="secondary-button" type="submit">
                Выйти
              </button>
            </form>
          </div>
        </div>

        <div className="panel settings-theme-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Дизайн</p>
              <h2>Тема интерфейса</h2>
            </div>
            <Palette size={18} />
          </div>
          <ThemeSelector />
        </div>

        <div className="panel settings-font-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Шрифт</p>
              <h2>Шрифт интерфейса</h2>
            </div>
            <Type size={18} />
          </div>
          <FontSelector />
        </div>
      </section>
    </main>
  );
}
