# Production Deployment

This setup deploys the tracker from GitHub to a self-hosted Docker host through
a self-hosted GitHub Actions runner.

## Runtime

- Public URL: `https://<app-domain>`
- Container image: `ghcr.io/<owner>/<repo>`
- Deployment path: `<deploy-path>`
- Published app port: `<host-port>`

Keep hostnames, private IP addresses, storage pool names, and real secrets out of
the repository. Store deployment-specific values in GitHub repository variables,
GitHub secrets, and the production `.env` file on the deployment host.

## Deployment Host

Create a directory for the app:

```sh
mkdir -p <deploy-path>
```

Copy `.env.production.example` to `<deploy-path>/.env` and fill real values on
the deployment host:

```sh
APP_BASE_URL=https://<app-domain>
APP_PORT=<host-port>
POSTGRES_PASSWORD=<long random value>
DATABASE_URL=postgres://task_tracker:<same password>@postgres:5432/task_tracker
APP_ENCRYPTION_KEY=<openssl rand -base64 32>
AUTH_SESSION_SECRET=<openssl rand -base64 48>
TASK_TRACKER_IMAGE=ghcr.io/<owner>/<repo>
TASK_TRACKER_TAG=main
```

If the GHCR package is private, log in once on the deployment host:

```sh
docker login ghcr.io -u <github-user>
```

Use a GitHub token with `read:packages`.

The deploy user must be able to run Docker commands non-interactively:

```sh
ssh <deploy-target> 'docker ps'
```

Use either root SSH keys or grant the deploy user access to the Docker socket.
Without this, GitHub Actions can SSH into the host but cannot run
`docker compose pull` or restart the app.

## Runner

Install a GitHub Actions self-hosted runner and add a custom label:

```text
docker-host-deploy
```

Make sure the runner user can SSH into the deployment host without a password:

```sh
ssh <deploy-target> 'docker compose version'
```

## GitHub Repository Configuration

Add these repository variables:

```text
DEPLOY_SSH_TARGET=<ssh-target>
DEPLOY_PATH=<deploy-path>
```

Add this repository secret when the GHCR package is private or the default
`GITHUB_TOKEN` does not have package write access:

```text
GHCR_TOKEN=<github-token-with-package-access>
```

## Reverse Proxy

Configure your reverse proxy to forward the public domain to the app port:

```text
Domain: <app-domain>
Scheme: http
Forward host: <deployment-host-address>
Forward port: <host-port>
WebSockets: enabled
Force SSL: enabled
HTTP/2: enabled
```

For Nginx Proxy Manager, the helper script can create or update the proxy host
when these variables are provided:

```sh
NPM_DATA_DIR=<npm-data-dir> \
TASK_TRACKER_DOMAIN=<app-domain> \
TASK_TRACKER_FORWARD_HOST=<deployment-host-address> \
TASK_TRACKER_FORWARD_PORT=<host-port> \
TASK_TRACKER_CERTIFICATE_ID=<certificate-id> \
ssh <deploy-target> 'bash -s' < scripts/deploy/configure-npm-proxy.sh
```

## First User

After the first successful deploy, create the first app user:

```sh
ssh -tt <deploy-target> 'cd <deploy-path> && docker compose --env-file .env -f compose.prod.yaml run --rm app npm run user:create -- --email you@example.com'
```

## Manual Deploy

From a local checkout of the repository:

```sh
DEPLOY_SSH_TARGET=<ssh-target> \
DEPLOY_PATH=<deploy-path> \
TASK_TRACKER_IMAGE=ghcr.io/<owner>/<repo> \
TASK_TRACKER_TAG=main \
scripts/deploy/docker-host-deploy.sh
```
