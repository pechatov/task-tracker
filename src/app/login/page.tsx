export default function LoginPage() {
  return (
    <main className="login-page">
      <form className="login-panel">
        <p className="eyebrow">Task Tracker</p>
        <h1>Вход</h1>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" />
        </label>
        <label>
          Пароль
          <input name="password" type="password" autoComplete="current-password" />
        </label>
        <button className="primary-button" type="button">Войти</button>
      </form>
    </main>
  );
}
