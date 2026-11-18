# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities through **GitHub Security Advisories**:

- Go to the repository's [Security tab](https://github.com/open-steward/opensteward/security/advisories/new)
- Click **Report a vulnerability**
- Provide a clear, reproducible report

We aim to acknowledge reports within 5 business days. Do not file public issues for security problems. We follow a coordinated 90-day disclosure window unless active exploitation requires a shorter timeline.

## Hardening Guide

Operators deploying this repository should read the full security guide and threat model:

→ [`docs/security/README.md`](docs/security/README.md)

When the docs-server is running, the same content is browsable at `/guides/security/`.

It covers attack surface, deployment-dependent risks, sample reverse-proxy and container-hardening configs, and a pre-production checklist.

## Deployment settings that carry security weight

These are the controls whose misconfiguration has the highest security impact.
The hardening guide above covers each in detail; this is the short list.

- **Secrets.** `./scripts/generate-secrets.sh > .env` mints `SESSION_SECRET`,
  `JWT_SECRET`, `STORE_SECRET`, `ADMIN_SECRET`, `SERVICE_SECRET` and
  `BOOTSTRAP_TOKEN` in one shot. The published images set `NODE_ENV=production`,
  under which a service booted on one of the shipped `change-me-…` placeholders
  refuses to start and names the offending variable. Environment always outranks
  a value in a mounted `config.yml`.
- **`/admin/*` fails closed.** With `NODE_ENV=production` and no `ADMIN_SECRET`,
  the admin routes on integration-server return `403 ADMIN_DISABLED` rather than
  serving. Outside production an unset `ADMIN_SECRET` leaves them open — that is
  a local-dev convenience, not a deployment posture.
- **First-run admin creation.** Set `BOOTSTRAP_TOKEN` before the first
  `docker compose up`. When it is set, `POST /api/auth/setup` requires a matching
  `X-Bootstrap-Token` header, compared in constant time, so a published
  deployment cannot be claimed by whoever reaches it first. The endpoint returns
  409 once any user exists.
- **Credential redaction in logs.** Every service builds its Fastify logger
  through `buildLoggerConfig` in `@opensteward/shared`, which applies
  `LOG_REDACT_PATHS` — authorization headers, cookies, the admin and bootstrap
  headers, and the `err.config.*` / `err.response.*` request echo that an
  AxiosError carries. Without that last group an ordinary upstream 5xx from any
  adapter prints a live customer access token to stdout. `pnpm check:server-logging`
  fails the build on a Fastify instance constructed outside it.
- **Outbound requests are SSRF-checked.** A sync `callback_url` must be https,
  carry no embedded credentials, and not resolve to a loopback, private or
  link-local address; it is validated when the job is enqueued and the hostname
  is re-resolved immediately before the request is sent. There is no escape
  hatch on that check: `OST_ALLOW_PRIVATE_HOSTS=1` relaxes only the separate
  outbound-fetch guard (`safeFetch`), and is for local development only.
