# Task Tracker

Personal task and calendar tracker. The MVP is a single-user web/PWA app with user-scoped data, read-only calendar sync, and a worker process for background jobs.

## Local Requirements

- Node.js 26.x
- npm 11.x
- Docker + Docker Compose for local Postgres

On CachyOS/Arch-like systems, Docker and PostgreSQL client tools can be installed with:

```sh
sudo pacman -S docker docker-compose postgresql-libs
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Log out and back in after adding the Docker group.

## Setup

```sh
npm install
cp .env.example .env
```

Generate secure local secrets:

```sh
openssl rand -base64 32
openssl rand -base64 48
```

Put the first value into `APP_ENCRYPTION_KEY` and the second into `AUTH_SESSION_SECRET`.

Start Postgres:

```sh
docker compose up -d postgres
```

Generate and run migrations:

```sh
npm run db:generate
npm run db:migrate
```

Create the first user:

```sh
npm run user:create -- --email you@example.com
```

Run the app:

```sh
npm run dev
```

Run the worker in another terminal:

```sh
npm run worker:dev
```

## Checks

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

## Product Notes

- Domain language lives in [CONTEXT.md](./CONTEXT.md).
- MVP scope lives in [docs/mvp-plan.md](./docs/mvp-plan.md).
- Architecture decisions live in [docs/adr](./docs/adr).
