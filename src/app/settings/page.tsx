import { RefreshCw, ShieldCheck } from "lucide-react";
import { requireCurrentUser } from "@/lib/auth/session";

export default async function SettingsPage() {
  const user = await requireCurrentUser();

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Интеграции и безопасность</h1>
        </div>
      </header>

      <section className="two-column">
        <div className="panel">
          <div className="panel-heading">
            <h2>Календари</h2>
            <RefreshCw size={18} />
          </div>
          <div className="settings-row">
            <div>
              <strong>Microsoft 365 / Exchange</strong>
              <p>Read-only sync, 60 дней назад / 60 дней вперед</p>
            </div>
            <button className="secondary-button" type="button">Подключить</button>
          </div>
          <div className="settings-row">
            <div>
              <strong>Яндекс.Календарь</strong>
              <p>CalDAV с выбором календарей</p>
            </div>
            <button className="secondary-button" type="button">Подключить</button>
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
              <button className="secondary-button" type="submit">Выйти</button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
