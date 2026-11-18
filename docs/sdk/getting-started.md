# `@opensteward/sdk` — getting started

Official TypeScript SDK for OpenSteward. Two clients in one package:

- **Public client** — for tenant developers consuming the unified
  `/v1/*` integration API. Auth: tenant Bearer API key (`osk_…`), or an
  OIDC bearer token from the operator's identity provider.
- **Operator client** — for operators and CI scripts driving the
  admin-api (`/api/*`). Auth: JWT issued by `POST /api/auth/login`,
  with built-in helpers to manage it.

Both clients are generated from the committed OpenAPI specs
(`docs/openapi/openapi.json` and `docs/openapi/admin-api.openapi.json`),
so every route in either spec is type-checked at compile time. Adding
or renaming a route in the source spec → rerun `pnpm sdk:generate` →
the new path appears in the SDK with no manual editing.

## Install

```bash
pnpm add @opensteward/sdk
# or: npm i @opensteward/sdk
# or: yarn add @opensteward/sdk
```

Needs a runtime with global `fetch`; the package declares no `engines`
floor of its own, and the monorepo builds on Node 24+. No browser-only
dependencies — the public client runs in browsers and on Node; the
operator client's `fromCredentialsFile()` helper is Node-only because it
reads disk.

## Public client (tenant developer)

```ts
import { createPublicClient } from '@opensteward/sdk'

const client = createPublicClient({
  baseUrl: 'http://localhost:3010',
  apiKey: process.env.OPENSTEWARD_API_KEY!,
})

// Typed end-to-end: path, query params, response shape.
const { data, error } = await client.GET('/customers', {
  params: { query: { limit: 10 } },
})

if (error) {
  console.error('list failed', error)
  process.exit(1)
}

for (const c of data!.data) {
  console.log(c.id, c.displayName)
}
```

`baseUrl` is the **bare host** — no `/v1`. The client appends the version
segment itself, per path (details below). A `baseUrl` ending in `/v1`
double-prefixes to `/v1/v1/…` and 404s on every call.

### Test mode (sandbox)

Pass `mode: 'test'` and every versioned call routes to the deployment's
`/test/v1/*` sandbox — synthetic data seeded from the documented schema
examples, no upstream calls, and writes that persist until
`DELETE /test/v1/reset`:

```ts
const sandbox = createPublicClient({
  baseUrl: 'http://localhost:3010',
  mode: 'test', // default: 'live'
  apiKey: process.env.OPENSTEWARD_TEST_API_KEY!, // a key minted with --test
})

// Discover the sandbox's synthetic connection ids — no setup step needed.
const { data } = await sandbox.GET('/test/v1/connections')
```

The two modes never share a credential: a live key on `/test/v1/*` answers
`403 KEY_MODE_MISMATCH`, and so does the reverse. Going to production is
therefore exactly two edits: drop `mode: 'test'` and swap in the live key.
The sandbox accepts `osk_test_` keys only — OIDC bearer tokens are refused
there by design (the verifier would need egress the sandbox promises not
to have).

### Authenticating with an OIDC token instead

Where the deployment's operator has registered an identity provider, the
same routes accept a short-lived token from it. Pass `getAccessToken`
instead of `apiKey` — a function rather than a string, because tokens
expire and the client has to be able to ask again:

```ts
import { createPublicClient, clientCredentialsTokenSource } from '@opensteward/sdk'

const client = createPublicClient({
  baseUrl: 'http://localhost:3010',
  getAccessToken: clientCredentialsTokenSource({
    tokenUrl: 'https://idp.example.com/oauth/token',
    clientId: process.env.IDP_CLIENT_ID!,
    clientSecret: process.env.IDP_CLIENT_SECRET!,
    // The API identifier the operator registered as the issuer's audience.
    audience: 'https://opensteward.internal',
  }),
})
```

`clientCredentialsTokenSource` caches the token until a minute before it
expires and collapses concurrent callers into one request, so a busy
client does not hammer the token endpoint. It is deliberately small —
if you already have an OAuth library, hand `getAccessToken` whatever it
gives you:

```ts
const client = createPublicClient({
  baseUrl: 'http://localhost:3010',
  getAccessToken: () => myOAuthLibrary.getValidAccessToken(),
})
```

Nothing else changes. The token resolves to the same scopes an API key
does, so every route, error and scope rule below applies identically.
Two responses are specific to this pairing: `403 OAUTH_DISABLED` means
the deployment does not accept OIDC tokens, and `403 API_KEYS_DISABLED`
means it no longer accepts `osk_` keys — ask the operator which they
have enabled. Verification failures all answer the same
`401 UNAUTHENTICATED`, deliberately, so the response cannot be used to
enumerate the operator's service accounts.

Every operation in `docs/openapi/openapi.json` is callable. Use
`client.GET`, `client.POST`, `client.PUT`, `client.PATCH`, `client.DELETE`
with a path that exists in the spec — your IDE autocompletes both the
path and the request shape. Successful list responses are enveloped:
`{ data: [...] }`, usually with a `meta` alongside it.

### `baseUrl` and the version prefix

The spec keeps two namespaces (see
[`dev-api.md §11`](../dev-api.md#two-namespaces-one-servers-dropdown)), and
the client reconciles them so one instance serves both:

- **Versioned** — `/customers`, `/accounting/invoices`, `/{vertical}/sync`
  and friends are written without a version prefix in the spec. The client
  prepends `/v1` (or `/test/v1` in test mode) to these on the wire.
- **Unversioned** — `/health`, `/auth/*`, `/admin/*`, `/webhooks/*` and the
  sandbox control routes spell their real path in full and are sent as-is;
  a generated set (`public-unversioned.ts`) says which, so it cannot drift
  from the spec.

So: always pass the bare host. There is no need for a second client
instance, and a `baseUrl` that already carries `/v1` is the one
configuration that breaks.

## Operator client (CLI / CI scripts)

```ts
import { createOperatorClient } from '@opensteward/sdk'

const op = createOperatorClient({ baseUrl: 'http://localhost:3001' })

// 1. Login — stores the JWT inside the client instance.
await op.login('admin', process.env.OS_PASSWORD!)

// 2. Make typed calls. Authorization header is added automatically.
const { data } = await op.GET('/api/users', {})
console.table(data?.data)

// 3. Done.
await op.logout()
```

### Reusing a token

`.login()` is one of three ways to put a token on the client:

```ts
// (a) From an existing JWT (env var, another script, etc.)
op.setToken(process.env.OS_TOKEN!)

// (b) From a credentials file on disk (the path the `os` CLI writes:
//     ~/.config/opensteward/credentials.json).
op.fromCredentialsFile('/Users/me/.config/opensteward/credentials.json')

// (c) `await op.login(user, pw)` — covered above.
```

`@opensteward/cli` writes that file from `os setup`, whose first step signs
in and persists the JWT to `~/.config/opensteward/credentials.json` (file
mode 0600, directory 0700). `os auth login` mints a JWT too, but — like
every mechanically generated command — it prints the response rather than
saving it. `fromCredentialsFile()` is the supported way to pick the stored
token up in scripts without re-prompting for credentials. Full command
reference: [`operations/cli.md`](../operations/cli.md).

### Inspecting / clearing the token

```ts
op.getToken()         // returns the stored JWT, or `null`
op.setToken(null)     // clear without calling the API
await op.logout()     // POSTs /api/auth/logout, then clears
```

## Type-level access to operations

The package re-exports the underlying `paths` types so you can derive
your own helper types per operation:

```ts
import type { PublicPaths, OperatorPaths } from '@opensteward/sdk'

type ListCustomersResponse =
  PublicPaths['/customers']['get']['responses']['200']['content']['application/json']

type CreateUserBody =
  OperatorPaths['/api/users']['post']['requestBody']['content']['application/json']
```

## Error shape

`openapi-fetch` returns `{ data, error, response }` — a tagged union
where success has `data` set and failure has `error`. The HTTP
`Response` is always available for callers that need raw access
(headers, status, body stream).

```ts
const { data, error, response } = await client.GET('/customers', {})
if (error) {
  console.error(`HTTP ${response.status}`, error)
}
```

## Versioning

The SDK ships in lock-step with the OpenSteward release that produced
its specs. A spec change → `pnpm sdk:generate` runs as part of
`pnpm docs:all`. CI fails (`pnpm check:docs`) if the committed
generated files drift from the live specs, so the published SDK surface
always matches the specs.
