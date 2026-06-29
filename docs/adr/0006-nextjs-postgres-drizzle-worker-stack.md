# Next.js, Postgres, Drizzle, and worker stack

We will build the application with Next.js, React, and TypeScript backed by Postgres and Drizzle ORM, with a separate worker process for calendar synchronization and background jobs. This keeps the MVP deployable with Docker Compose on a personal server while separating user-facing requests from slower integration work without adding Redis or a separate job infrastructure at the start.
