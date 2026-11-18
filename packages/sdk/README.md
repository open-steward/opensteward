# @opensteward/sdk

Official TypeScript SDK for [OpenSteward](https://github.com/open-steward/opensteward) —
the self-hosted integration aggregator mapping 1,548 platforms across nine
verticals to one unified REST API.

Two clients in one package, both generated from the committed OpenAPI specs,
so every path, query param and response shape is checked at compile time:

- **Public client** — for tenant developers consuming the unified `/v1/*`
  API. Auth: a tenant Bearer API key (`osk_…`) or an OIDC bearer token.
- **Operator client** — for operators and CI scripts driving the admin-api
  (`/api/*`). Auth: JWT from `POST /api/auth/login`, managed for you.

## Install

```bash
npm i @opensteward/sdk
```

Needs a runtime with global `fetch` (Node 18+, or any modern browser for the
public client).

## Public client

```ts
import { createPublicClient } from '@opensteward/sdk'

const client = createPublicClient({
  baseUrl: 'https://api.your-deployment.example', // bare host — no /v1
  apiKey: process.env.OPENSTEWARD_API_KEY!,
})

const { data, error } = await client.GET('/customers', {
  params: { query: { limit: 10 } },
})
```

`baseUrl` is the bare host: the client appends the version segment itself,
per path, and knows which routes are unversioned (`/health`, `/auth/*`, …).

### Test mode

```ts
const sandbox = createPublicClient({
  baseUrl: 'https://api.your-deployment.example',
  mode: 'test', // routes versioned paths at /test/v1 — synthetic data, no upstream calls
  apiKey: process.env.OPENSTEWARD_TEST_API_KEY!, // minted with --test
})
```

Live and test keys are never interchangeable (`403 KEY_MODE_MISMATCH`).
Going to production is two edits: drop `mode: 'test'`, swap the key.

### OIDC bearer tokens

```ts
import { createPublicClient, clientCredentialsTokenSource } from '@opensteward/sdk'

const client = createPublicClient({
  baseUrl: 'https://api.your-deployment.example',
  getAccessToken: clientCredentialsTokenSource({
    tokenUrl: 'https://idp.example.com/oauth/token',
    clientId: process.env.IDP_CLIENT_ID!,
    clientSecret: process.env.IDP_CLIENT_SECRET!,
    audience: 'https://opensteward.internal',
  }),
})
```

## Operator client

```ts
import { createOperatorClient } from '@opensteward/sdk'

const op = createOperatorClient({ baseUrl: 'https://admin-api.internal:3001' })
await op.login(process.env.OS_ADMIN_USER!, process.env.OS_ADMIN_PASSWORD!)
const { data } = await op.GET('/api/tenants')
```

## Documentation

Full guide, auth details and every route:
[`docs/sdk/getting-started.md`](https://github.com/open-steward/opensteward/blob/main/docs/sdk/getting-started.md)
in the OpenSteward repository, and the rendered Unified API reference on your
deployment's docs-server (`:3003`).

## License

Apache-2.0
