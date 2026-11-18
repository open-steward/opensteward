# Runtime data flows

> [← back to overview](./README.md)

Four sequence diagrams covering the main runtime patterns: an API request through the cache, the sync worker job lifecycle, an OAuth connection, and an inbound webhook.

---

## Chart 4a — API consumer GET → cache → upstream → response

A developer calls `GET /v1/accounting/contacts/inv-1?connection_id=<uuid>` directly on `integration-server` with a tenant-scoped Bearer key. The auth middleware resolves the key + scope + tenant; the per-vertical plugin attaches the data-store context; `cachedGet` decides cache-vs-live, fetches/transforms if needed, and writes back. Default mode is `database` (read-through cache).

```mermaid
sequenceDiagram
  participant Client as Developer backend
  participant IS as integration-server (:3010)
  participant Keys as ApiKeyStore
  participant Sess as ConnectSessionStore
  participant RL as rate-limit (mem / Redis)
  participant CS as CredentialStore
  participant Helper as cachedGet helper
  participant RS as ResourceStore (resources.db)
  participant Reg as UnifiedAdapterRegistry
  participant Fort as Fortnox adapter
  participant Up as Fortnox API

  Client->>IS: GET /v1/accounting/contacts/inv-1?connection_id=<uuid><br/>Authorization: Bearer osk_acme_…
  IS->>Keys: verify(token)
  Keys-->>IS: { tenantId, apiKeyId, scopes }
  IS->>Sess: connectionBelongsToTenant(connectionId, tenantId)
  Sess-->>IS: true (else 403 CONNECTION_FORBIDDEN)
  IS->>RL: consume(apiKeyId, 600/60s)
  RL-->>IS: { ok, remaining } (else 429 RATE_LIMITED)
  IS->>CS: getRow(connectionId)
  CS-->>IS: { vertical: accounting, platform: fortnox, encrypted }
  IS->>IS: assertScope("vertical:accounting")<br/>(else 403 INSUFFICIENT_SCOPE)
  IS->>Helper: cachedGet({ resourceType: contacts, id: inv-1 })
  alt mode = passthrough OR ?is_live=true
    Note over Helper,RS: Cache read skipped
    Helper->>Reg: get(vertical, platform)
    Reg-->>Helper: FortnoxAdapter
    Helper->>Fort: getContact(creds, "inv-1")
    Fort->>Up: GET /3/customers/inv-1
    Up-->>Fort: 200 + raw JSON
    Fort->>Fort: transform(raw) → Contact
    Fort-->>Helper: Contact
    alt mode != passthrough
      Helper->>RS: upsert(...) — write-back even on live
    end
    alt mode = external
      Helper->>Helper: emitTenantEvent(resource.updated)
    end
  else cache hit (fresh)
    Helper->>RS: get(...) → row
    RS-->>Helper: Contact (cached)
  else cache miss
    Helper->>RS: get(...) → null
    Helper->>Fort: getContact(creds, "inv-1")
    Fort-->>Helper: Contact
    Helper->>RS: upsert(...) — first-time populate
  end
  Helper-->>IS: Contact
  IS-->>Client: 200 { data, meta }<br/>x-ratelimit-*, x-opensteward-cache headers
```

**Key points:**
- No separate gateway service — `/v1/*` lands directly on `integration-server` and `unifiedAuthMiddleware` runs as a `preHandler`. A second per-vertical `preHandler` decorates `request.cacheMode`/`.resourceStore`/`.vertical` for `cachedGet` / `cachedList` / `writeThrough` / `cachedDelete`.
- `?is_live=true` is **bypass-read, write-back** — fresh upstream data is still written into the cache. A live bypass is visible to the caller too: every cached-route GET returns `X-OpenSteward-Cache: hit|miss|live|passthrough` (absent on mutations), and hits add `X-OpenSteward-Synced-At` with the ISO time the rows were cached — the `data-store: live bypass` INFO log remains for server-side auditing.
- `dataStore.staleAfterSeconds` (optional) treats rows older than the TTL as a miss; `?is_live` is unaffected.
- POST / PATCH / DELETE follow the same shape: live upstream first, then `writeThrough` (or `cachedDelete`) into the cache. Errors after the upstream succeeds log at ERROR but don't fail the response — the operator-visible recovery path is `?is_live=true` or `/admin/connections/:id/cache-clear`.
- Per-key rate limit is 600 req/60s (`DEFAULT_API_KEY_RATE_LIMIT`); in-memory by default, shared across replicas via `REDIS_URL`. A second, global per-IP bucket runs in `createBaseServer` — see [services.md § Rate limiting](./services.md#rate-limiting) for why requests presenting `X-Admin-Secret` skip it.
- Token refresh is automatic when `isTokenExpired(creds)` is true. It runs through `withRefreshLock` + `refreshWithRotationGuard`, which re-encrypts the credential, writes it back, **and records the outcome** on the connection row (`last_refresh_at` / `last_refresh_status` / `last_refresh_error`). A non-`ok` outcome returns 401 `TOKEN_REFRESH_FAILED`.
- The adapter transforms the platform's raw response into the canonical Zod schema; `metadata` preserves the unmodified raw payload.

---

## Chart 4d — SyncWorker job lifecycle

Operators monitor + cancel jobs at `/sync-jobs`, and enqueue one from either connections view (`POST /connections/:vertical/:id/sync` in the admin UI, `operator` role) — that path goes through admin-api's `POST /api/sync-jobs` and surfaces the upstream refusal verbatim, so a 409 `SYNC_IN_PROGRESS` reads as such rather than as a generic 500:

![Sync jobs dashboard](../assets/screenshots/sync-jobs-list.png)

`POST /v1/{vertical}/sync?connection_id=…` enqueues a job, and so, without any client, does the `SyncScheduler` whenever a connection's [sync schedule](../dev-api.md#sync-schedules) says it is due (see [services.md](./services.md#sync-scheduler)). One `SyncWorker` per vertical polls `sync_jobs` for pending rows at `pollIntervalMs` (default 1s). The worker walks the vertical's `LISTABLE_RESOURCES`, paginates through each upstream resource, bulk-upserts into `resources`, and (in `external` mode) emits one `resource.synced` event per page or per row.

```mermaid
sequenceDiagram
  participant Client as Developer / Connect Link callback
  participant IS as integration-server (:3010)
  participant SS as SyncStore (sync_jobs)
  participant W as SyncWorker
  participant TR as TokenRefresher
  participant CB as CircuitBreaker
  participant Fort as Fortnox adapter
  participant Up as Fortnox API
  participant RS as ResourceStore (resources)
  participant Subs as WebhookSubscriptions

  Client->>IS: POST /v1/accounting/sync?connection_id=<uuid>
  IS->>SS: createIfIdle(vertical, connectionId, platform, tenantId, callbackUrl?, origin: api)
  alt active job exists (one-active-job index refuses the insert)
    SS-->>IS: { job: existing pending/running job, created: false }
    IS-->>Client: 409 SYNC_IN_PROGRESS
  else no active job
    SS-->>IS: { job: SyncJob { id, status: pending }, created: true }
    IS-->>Client: 202 { data: SyncJob }
  end

  loop every pollIntervalMs (default 1s)
    W->>SS: findPending(vertical) (concurrency-bounded)
    SS-->>W: SyncJob | null
  end

  W->>SS: markRunning(id)
  W->>TR: ensureFresh(adapter, creds, connectionId)
  TR-->>W: refreshed Credentials
  W->>CB: isOpen(connectionId)?
  alt circuit open
    W->>SS: markFailed("Circuit breaker is open")
  else circuit closed
    loop for each ListableResource (invoices, contacts, ...)
      W->>SS: updateProgress({ status: running })
      Note over W: sweepBefore = now (before the first request)
      loop pages until the last one (hasMore false, else a short page)
        W->>Fort: listX(creds, { page, limit })
        Fort->>Up: GET /3/X?page=N
        Up-->>Fort: items[]
        Fort-->>W: items[]
        W->>RS: upsertMany(vertical, platform, connectionId, type, items)
        alt mode = external
          W->>Subs: emit resource.synced (per item OR per page if batchEvents)
        end
      end
      alt end known (hasMore reported, or maxPageSize declared) AND rows written
        W->>RS: sweepCollection(..., type, min(sweepBefore, oldest stamp)) (no event)
        W->>RS: markCollectionComplete(..., type)
      else end guessed, or no rows written
        W->>RS: invalidateCollection(..., type)
      end
      W->>SS: updateProgress({ status: completed })
    end
    W->>SS: markCompleted(id, progress)
    opt callback_url present
      W->>Client: POST callback_url { event: sync.completed, job }
    end
  end
```

**Key points:**
- **`/sync` is a READ-scope endpoint.** It is a `POST` because it enqueues a job, not because it changes anything upstream — the worker only lists upstream, and upserts and removes rows in the local cache. The route declares `config: { readSafe: true }`, which is the one exemption `requiresWriteScope()` honours (and it must be exactly `true`); every other non-GET still needs `vertical:write`. This lets the recommended API-key preset, which omits `vertical:write` by design, refresh the data it can read.
- **`callback_url` still requires `vertical:write`**, and the URL is validated at enqueue (`validateCallbackUrl`): https only, no embedded credentials, no loopback/private/link-local address. `callback.ts` re-resolves the name immediately before the POST, because a name can resolve elsewhere by the time the job runs. Supplying one makes the deployment issue an outbound request from inside the network, which is a different authority from "refresh my cache".
- `POST /sync` has its own cap on top of the per-key bucket: 10 per hour per `(vertical, apiKeyId)`, refused with 429 `SYNC_RATE_LIMITED` and a `Retry-After`.
- Every `/sync` route — including `GET /sync/:id` — needs `?connection_id=`; the auth middleware rejects a request without one with 400 `CONNECTION_ID_REQUIRED`, and a job belonging to another connection reads back as 404 rather than leaking its id.
- Other enqueuers, none with a client involved, each recorded as the job's `origin`: the `SyncScheduler` every 60 s (`schedule` — never-synced connections first, then the most overdue, at most two jobs waiting per vertical per replica), the OAuth callback of a Connect Link (`connect`; skipped for a `trigger_only` link, and a link completed through the credential form leaves the first sync to the scheduler), boot with `DATA_STORE_AUTO_SYNC_ON_BOOT=true` (`boot`; skips `trigger_only` connections), and the admin console's **Sync now** (`manual`). Every one goes through `syncStore.createIfIdle`.
- **At a known end the worker removes cached rows the platform did not return** (`sweepCollection`), then marks the collection complete. A known end is a reported `hasMore`, or a declared `maxPageSize` behind a short page; a guessed end, or a sync that wrote no rows, removes nothing and drops the marker instead. Removal emits no event. So a key with only `vertical:read` can, through `POST /sync`, remove cached rows other consumers of the connection were reading — never anything upstream. The limits, including rows removed that the platform still has, are in [dev-api.md §7](../dev-api.md#rows-deleted-upstream).
- `createIfIdle` refuses a second active job for a connection — a partial unique index on `sync_jobs` enforces it, across replicas too — so a duplicate enqueue gets a 409 rather than racing two workers on the same connection.
- One shared `CircuitBreaker` across all 9 verticals — a flapping upstream stops draining its job queue cleanly.
- `pollIntervalMs` + `maxConcurrency` + `pageSize` are configurable via `dataStore.syncPageSize` env / config; sane defaults (1000ms / 2 / 500).
- Worker shutdown: `SIGTERM` calls `worker.stop()` which clears the timer, aborts in-flight `processJob` calls, waits up to 30s for them to drain, then resets any still-running rows back to `pending` so the next boot picks them up (`resetRunning(vertical)`).
- Jobs older than 30 days are pruned daily by `dataStoreMaintenance` (see `apps/integration-server/src/data-store-maintenance.ts`).

---

## Chart 4b — OAuth connection authorization

Two ways an OAuth dance starts: an admin/operator authorising from the wizard, or an end-customer opening a Connect Link. Both land on the same `/auth/:vertical/:platform/connect` → `/auth/:vertical/:platform/callback` pair; the callback branches on whether the pending state carried a `sessionId`.

```mermaid
sequenceDiagram
  participant User as Operator or end-customer (browser)
  participant IS as integration-server (:3010)
  participant Pend as pendingStates (in-memory map)
  participant Sess as ConnectSessionStore
  participant CS as CredentialStore
  participant Subs as WebhookSubscriptions
  participant Fort as Fortnox

  User->>IS: GET /auth/accounting/fortnox/connect<br/>?tenant_id=acme&label=main
  IS->>IS: registry.get(vertical, platform) → adapter
  IS->>IS: state = randomBytes(32).toString('hex')
  IS->>IS: derived = PUBLIC_BASE_URL ?? companyInfo.baseUrl<br/>+ /auth/accounting/fortnox/callback
  IS->>IS: url = adapter.getAuthUrl(state)
  IS->>IS: redirectUri = url's redirect_uri ?? derived
  IS->>Pend: storePendingState(state, platform,<br/>{ vertical, tenantId, label, redirectUri, sessionId? })
  IS-->>User: 302 → Fortnox authorize URL

  User->>Fort: GET /oauth/authorize?client_id=…&state=…
  Fort-->>User: Login + consent
  User->>Fort: Approve
  Fort-->>User: 302 → {redirectUri}?code=…&state=…

  User->>IS: GET /auth/accounting/fortnox/callback?code=…&state=…
  IS->>Pend: consumePendingState(state)
  Pend-->>IS: { vertical, platform, tenantId, label, redirectUri, sessionId? }<br/>(else 400 INVALID_STATE)
  IS->>IS: pending.platform == platform &&<br/>pending.vertical == vertical?<br/>(else 400 STATE_MISMATCH)
  IS->>Fort: adapter.exchangeCode(code, redirectUri)
  Fort-->>IS: Credentials { accessToken, refreshToken, expiresAt, tenantId? }
  alt sessionId present (Connect Link flow)
    IS->>Sess: getById(sessionId)
    Sess-->>IS: { tenantId: ownerTenantId }
  end
  IS->>CS: create(platform, tenantId, creds, label, vertical, ownerTenantId?)
  CS->>CS: encrypt(JSON.stringify(creds), STORE_SECRET, salt)
  CS-->>IS: connectionId
  alt Connect Link flow
    IS->>Sess: markConsumed(sessionId, connectionId)
    Sess-->>IS: { token, redirectUrl? }
    IS->>Subs: emitTenantEvent('connect_link.consumed', …)
    IS-->>User: 302 → redirectUrl ?? /connect/{token}/done
  else Admin-tooling flow
    IS-->>User: 201 { data: { id, vertical, platform, tenantId, label, status: connected } }
  end
```

**Key points:**
- `clientId`, `clientSecret`, `redirectUri`, `scopes` come from the **AdapterSettingsStore** — operators set them via `/setup/wizard/configure` and they're encrypted at rest.
- The `redirectUri` replayed at exchange is **the one the authorize URL carried** — RFC 6749 §4.1.3 requires the token request to repeat it exactly. It comes from the adapter's own configured Redirect URI, so it may sit on another origin than the deployment's (an https-only provider on an http deployment — see [local HTTPS](../operations/local-https.md)). Only when the authorize URL carries no `redirect_uri` is it derived, in this order: explicit `redirect_uri` query param (validated) → `PUBLIC_BASE_URL` env → `companyInfo.baseUrl` → `request.protocol` + `request.host` (with `trustProxy` honouring `X-Forwarded-*`). Suffix is always `/auth/{vertical}/{platform}/callback`. The host carries its **port** — the code uses `request.host`, not `request.hostname`, which strips the port in Fastify 5 and would derive `redirect_uri` values on :80 for deployments served elsewhere. A tenant's custom domain deliberately does **not** enter this order: OAuth callbacks stay on the canonical domain so a provider needs only one allowlisted URL.
- The **Connect Link** URL handed to a customer uses `resolvePublicBaseUrlOrNull`, which inserts the tenant domain after the env override and returns `null` rather than a base no customer's browser could open. A single-label host (`integration-server`, `admin-api`) is the signature of a compose service alias: the session is still created, but the response carries `url: null` and `urlUnresolved: true` instead of an unreachable address. `docker-compose.yml` defaults `PUBLIC_BASE_URL` to `http://localhost:3010` so links are addressable out of the box.
- Scope requested at OAuth-start follows the link's **scope policy**, resolved by `resolveOverrideScopesFor`: `read_only` sends the platform's curated `readScopes` (falling back to the platform default when the platform has none), `custom` sends the link's own list, `platform_default` sends no override. It is a per-link policy, not a property of the connection.
- `state` is a 256-bit random hex held single-use in an in-process `pendingStates` map; `consumePendingState` deletes it on first read. CSRF protection comes from unguessability + one-time consume, not HMAC.
- Connect Link flows carry a `sessionId` in pending state; the callback marks the `connect_session` consumed, fires `connect_link.consumed`, and 302s to `redirectUrl` (or the hosted thank-you page). Admin-tooling flows return a `201` JSON body and leave `owner_tenant_id` NULL.
- The credential write is encrypted with AES-256-GCM, key derived via scrypt from `STORE_SECRET` + the credential store's salt (`opensteward-v1`). The salt is per-store, not per-vertical — every vertical's connections share one table and one key. See [persistence.md § Encryption](./persistence.md#encryption) for the full salt list.

---

## Chart 4c — Inbound webhook → vertical → DLQ

A provider sends a webhook to the webhook-gateway. The gateway verifies HMAC, persists the delivery, forwards to the vertical, and enqueues retry on failure.

```mermaid
sequenceDiagram
  participant Up as Fortnox
  participant WGW as Webhook Gateway (:3004)
  participant DS as DeliveryStore
  participant IS as integration-server (:3010)
  participant RW as RetryWorker (poller)
  participant DLQ as DLQ table

  Up->>WGW: POST /webhooks/fortnox<br/>Webhook-Signature: sha256=...
  WGW->>WGW: verifyHmacSha256(body, secret)
  WGW->>DS: createDelivery(platform, vertical, targetUrl, payload)
  DS-->>WGW: deliveryId

  WGW->>IS: POST /webhooks/fortnox<br/>(headers preserved, body forwarded)
  alt success (2xx)
    IS-->>WGW: 200
    WGW->>DS: markDelivered(deliveryId, 200)
    WGW-->>Up: 200 { status: "delivered" }
  else failure or unreachable
    IS-->>WGW: 5xx / timeout
    WGW->>DS: markFailed(deliveryId, status, error)
    DS->>DS: schedule next_retry_at = now + backoff[attempt]
    WGW-->>Up: 202 { status: "queued_for_retry" }
  end

  loop every 5 seconds
    RW->>DS: listRetryable() (where next_retry_at <= now)
    DS-->>RW: failed deliveries
    RW->>IS: POST {target_url} (retry)
    alt success
      RW->>DS: markDelivered(id, 200)
    else still failing & attempts < max
      RW->>DS: markFailed (next backoff)
    else max attempts exceeded
      RW->>DLQ: move to dlq status
    end
  end
```

**Key points:**
- Backoff schedule: **1s, 5s, 30s, 5m, 30m** — 5 retries total before DLQ.
- The webhook-gateway always returns `200` or `202` to the provider — never propagates a 5xx upstream, so providers never disable our endpoint for being "broken".
- Failed deliveries go to a `dlq` status where they can be manually replayed via `POST /webhooks/dlq/:id/retry`.
- HMAC secrets are configured per platform in `webhook-gateway/config/config.yml`.

---

## See also

- [webhook-delivery.md](./webhook-delivery.md) — the full delivery state machine including DLQ replay
- [auth-and-tenancy.md](./auth-and-tenancy.md) — what `tenantId` actually is and where it comes from
- [adapter-lifecycle.md](./adapter-lifecycle.md) — how the adapter's `clientId`/`clientSecret` got into the AdapterSettingsStore in the first place
