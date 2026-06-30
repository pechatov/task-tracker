import { redirect } from "next/navigation";
import { login } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/session";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  const params = await searchParams;
  const hasInvalidCredentialsError = getFirst(params.error) === "invalid";

  return (
    <main className="login-page">
      <form action={login} className="login-panel">
        <p className="eyebrow">Task Tracker</p>
        <h1>Вход</h1>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required autoFocus />
        </label>
        <label>
          Пароль
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {hasInvalidCredentialsError ? (
          <p className="form-error">Неверный email или пароль.</p>
        ) : null}
        <button className="primary-button" type="submit">Войти</button>
      </form>
    </main>
  );
}
