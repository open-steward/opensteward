# Rehearsing admin SSO without an identity provider

The admin UI signs operators in through OpenID Connect, SAML or LDAP once an
identity provider is registered on **Identity providers**. Setting one of those
up just to see the flow work is slow, so the repo ships a mock OpenID Provider
that plays the IdP's part on your machine: a login page (a persona picker
instead of a password), an authorization-code + PKCE token endpoint, and
`userinfo`. Nothing about admin-api is stubbed — it runs the same discovery,
code exchange, id_token verification, JIT provisioning and role mapping it
runs against Okta or Entra.

The same process also mints bearer tokens for the developer API
(`client_credentials`), which is what it was first written for; that half is
described at the bottom.

## 1. Start the mock IdP

**Platform running in compose** (the usual case): the `sso-dev` profile
starts the mock IdP as a container, published on the host's loopback at
<http://localhost:9400>, together with a small bridge that makes admin-api's
own `localhost:9400` reach it (admin-api accepts a plain-`http` issuer on
loopback only). Nothing in the profile starts unless asked for, so a plain
`docker compose up` never creates either:

```bash
docker compose --profile sso-dev up -d
```

Or put `COMPOSE_PROFILES=sso-dev` in `.env` to have every compose command
include it. Stop with `docker compose --profile sso-dev stop sso-dev-idp
sso-dev-proxy`; its logs (`docker compose logs sso-dev-idp`) print the
registration values below and each sign-in.

**After a redeploy that recreates admin-api**, the bridge has to be recreated
too: it lives inside admin-api's network namespace, and a plain
`docker compose up -d` without the profile leaves the old one attached to a
container that no longer exists. Symptom: the sign-in button answers 502 and
admin-api logs `ECONNREFUSED` for `localhost:9400`. Compose fixes it by
itself whenever the profile is active, so either keep `COMPOSE_PROFILES`
in `.env` or run `docker compose --profile sso-dev up -d` once after the
redeploy.

**Platform running on the host** (each service started with its own `dev`
script, e.g. `pnpm --filter admin-api dev` and `pnpm --filter admin dev`;
the repo root has no `dev` script): no bridge needed, run the issuer
directly:

```bash
pnpm dev:oidc-issuer            # http://localhost:9400
```

Either way the keys live in memory: restart it and the JWKS changes, which is
harmless (admin-api rediscovers on every login) but means an id_token from
before the restart is dead.

## 2. Register it as an identity provider

On <http://localhost:3000/identity-providers/new>, protocol **OpenID Connect**:

| Field | Value |
|---|---|
| Name | Dev IdP (anything) |
| Slug | `dev` |
| Issuer URL | `http://localhost:9400` |
| Client ID | `opensteward-admin` |
| Client secret | `dev-secret` |
| Scopes | `openid profile email` |
| Groups claim | `groups` |
| JIT provisioning | on |
| Default role | `viewer` |

Then add two role-mapping rules on the provider, claim path `groups`, match
type `contains`:

| Value | Role |
|---|---|
| `ost-admins` | `admin` |
| `ost-operators` | `operator` |

## 3. Sign in

Sign out, open <http://localhost:3000/login>, and use **Sign in with Dev
IdP**. The mock's page offers three people:

| Persona | Groups | Lands as |
|---|---|---|
| `alice` | `ost-admins` | admin |
| `bob` | `ost-operators` | operator |
| `carol` | none | the default role, viewer |

Each is provisioned on first sign-in (username from the email) and re-mapped on
every sign-in, so changing a rule and signing in again changes the role. The
**Audit** page records each as `sso.login`.

Worth trying next, since it is the switch a real rollout throws: turn
`auth.local_login_enabled` off under **Settings**. The password form disappears
from the login page and only SSO (and the break-glass account) gets in. Turn
it back on the same way.

## Automation

`login_hint=<persona>` on the authorization request skips the picker, which is
how the tests and any script drive the flow without a browser.

The flow is covered without Docker or a browser by:

- `apps/admin-api/tests/journeys/sso-oidc-login.test.ts` — the real routes
  against the mock, hop by hop: initiation, the IdP redirect, the callback's
  code exchange, the handoff, and group → role mapping.
- `apps/admin/tests/journeys/sso-login.test.ts` — the UI's three hops:
  provider button, redirect to admin-api, handoff code → session cookie.
- `packages/shared/tests/auth/mock-oidc-login.test.ts` — the mock itself
  refuses what a real IdP refuses (bad PKCE verifier, reused code, wrong
  client secret).

## What the mock is not

It is a development tool. It binds to loopback, has no passwords, accepts any
`redirect_uri`, and its signing key is regenerated on every start. Never point
a deployment that matters at it, and never expose port 9400.

## The other half: bearer tokens for the developer API

The same process serves `client_credentials` at `/token`, minting live-mode
tokens for `/v1/*` once it is registered on **OAuth clients** (preset
*Generic OIDC*; the script prints the values). integration-server needs
`OST_ALLOW_PRIVATE_HOSTS=1` to accept a plain-http issuer, and
`auth.dev_oauth_enabled` on. For the sandbox, `/test/v1/*`, use the built-in
`/test/oidc` issuer instead — it needs no separate process (see
`docs/dev-api.md`).
