/**
 * Thin HTTP client against the single unified OpenSteward backend.
 *
 * The unified service answers for every vertical, so there's one baseURL
 * and the vertical is a per-request filter/path segment.
 */
import type { Readable } from 'node:stream'
import axios, { type AxiosInstance } from 'axios'
import type { ConnectionSyncState, SyncMode, SyncSchedule } from '@opensteward/shared'

/** Header integration-server's `/admin/data/*` routes read the caller scope from. */
export const DATA_SCOPE_HEADER = 'X-OpenSteward-Data-Scope'

/**
 * The caller scope sent with every stored-data request. See
 * `apps/integration-server/src/data-access/scope.ts` for how it is enforced.
 */
export interface DataScopeHeader {
  tenants: '*' | string[]
  /** Verticals granted within each tenant; a tenant not listed keeps all. */
  tenantVerticals?: Record<string, '*' | string[]>
  /** Only on a reveal or a PII export by a `data:read_pii` holder. */
  revealPii?: boolean
  /** `data_access.mask_financial`. */
  maskFinancial?: boolean
}

/** Methods for which axios derives a Content-Type from the payload. */
const BODY_METHODS = new Set(['post', 'put', 'patch'])

/**
 * True when the upstream answered 404 — the one failure that is a real answer
 * ("there is no row with that id") rather than an outage.
 *
 * Every method below that can hand back `null` / `false` tests for it, because
 * the routes above render the two outcomes very differently: the empty value
 * becomes a 404 with a definite message ("Webhook subscription not found."),
 * while a thrown error reaches the error handler in `openapi-setup.ts`, which
 * keeps the upstream's own status and reason (502 when integration-server never
 * answered at all). Collapsing them into a single `catch { return null }` would
 * tell the operator their row had been deleted whenever integration-server is
 * merely unreachable — or a stale X-Admin-Secret answers 403 — sending them
 * looking for a deletion that never happened.
 */
function isUpstreamNotFound(err: unknown): boolean {
  return (err as { response?: { status?: number } } | undefined)?.response?.status === 404
}

export interface VerticalHealth {
  status: string
  verticals?: string[]
  adapters?: number
  /** Enabled adapters per vertical. Absent on backends older than this field. */
  adaptersByVertical?: Record<string, number>
  timestamp?: string
}

export interface VerticalConnection {
  id: string
  platform: string
  vertical: string
  tenantId: string | null
  label: string | null
  status: string
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  /** Most recent refresh attempt — milliseconds since epoch, regardless of
   *  outcome. NULL when the keep-alive worker has not yet touched this row. */
  lastRefreshAt: number | null
  /** Outcome of that attempt:
   *  - 'ok'             — refresh succeeded (connection healthy)
   *  - 'failed'         — transient error; worker will retry next tick
   *  - 'expired'        — hard failure (invalid_grant); customer must re-authorize
   *  - 'platform_error' — the platform's OAuth client credentials were rejected
   *                       (invalid_client); the operator must fix the client
   *                       id/secret. Customer re-authorization will not help. */
  lastRefreshStatus: 'ok' | 'failed' | 'expired' | 'platform_error' | null
  /** The connection's sync schedule mode; rows from before it existed read 'default'. */
  syncMode?: SyncMode
  syncIntervalMinutes?: number | null
  /** Last/next sync as the scheduler sees them; null in passthrough mode. */
  sync?: ConnectionSyncState | null
}

export interface VerticalPlatform {
  slug: string
  name: string
  vertical: string
  auth_type?: string
  authType?: string
  category?: string
  website?: string
}

export interface PlatformRow {
  slug: string
  vertical: string
  enabled: boolean
  hasConfig: boolean
}

export interface PlatformConfigRedacted {
  clientId: string | null
  redirectUri: string | null
  scopes: string[] | null
  hasSecret: boolean
  recommendedScopes: string[] | null
  /** False when the adapter ignores per-link scope overrides — the admin
   *  UI uses this to disable the scope-group dropdown on the Connect Link
   *  form. Defaults to true when the response omits the field. */
  supportsScopeOverride?: boolean
  /** Current sandbox selection. Only meaningful when `supportsSandbox`. */
  sandbox?: boolean
  /** True when the platform has a separate sandbox OAuth environment; drives
   *  whether the admin UI renders the toggle at all. */
  supportsSandbox?: boolean
}

export interface UnifiedClientConfig {
  url: string
  adminSecret?: string
}

export class UnifiedClient {
  private client: AxiosInstance

  constructor(config: UnifiedClientConfig) {
    this.client = axios.create({
      baseURL: config.url,
      timeout: 10_000,
      headers: config.adminSecret ? { 'X-Admin-Secret': config.adminSecret } : {},
    })

    // A POST issued with no `data` argument goes out as
    // `Content-Type: application/x-www-form-urlencoded` with zero bytes — that
    // is the axios default for a bodyless request. The integration-server
    // registers no form-urlencoded parser, so Fastify answers 415 before the
    // route runs, and the operator sees "Unsupported Media Type" (or, where
    // the client swallows the error, no cause at all). Handing axios an empty
    // object instead makes it serialize `{}` as application/json, which those
    // routes accept: none of the ones reached without a body declare a body
    // schema. This lives on the instance rather than at each call site so the
    // next bodyless POST added here cannot reintroduce the 415.
    this.client.interceptors.request.use((request) => {
      if (request.data === undefined && BODY_METHODS.has((request.method ?? '').toLowerCase())) {
        request.data = {}
      }
      return request
    })
  }

  async getHealth(): Promise<VerticalHealth> {
    const { data } = await this.client.get('/health')
    return data
  }

  /**
   * Fire-and-tolerate: notify the integration-server that a runtime-
   * setting changed so it drops its cache and re-fetches. Best effort —
   * any failure just falls back to the 60 s TTL refresh.
   */
  async refreshRuntimeSettings(): Promise<void> {
    try {
      await this.client.post('/internal/runtime-settings/refresh')
    } catch {
      // intentionally swallowed — the change still lands via TTL
    }
  }

  /**
   * Whether OIDC bearer auth could actually admit anybody, per the
   * integration-server that owns the issuer and client rows.
   *
   * Throws when the integration-server cannot be reached. The caller must
   * treat that as "not ready" — refusing to disable API keys on an unproven
   * OAuth setup is recoverable; allowing it is a lockout.
   */
  async getOAuthReadiness(): Promise<{ ready: boolean; reason: string }> {
    const { data } = await this.client.get('/admin/oauth/readiness')
    const payload = data?.data ?? data
    return {
      ready: payload?.ready === true,
      reason: typeof payload?.reason === 'string' ? payload.reason : 'No reason reported.',
    }
  }

  /**
   * integration-server's license verdict (`GET /admin/license`, admin guard),
   * unparsed: the caller validates it against `LicenseStatusUpstream`. Throws on
   * every failure, 404 included — a missing route is no answer, never "no
   * license". A 403 (`ADMIN_DISABLED`: no ADMIN_SECRET on integration-server;
   * `FORBIDDEN`: a different one) is thrown with its body, which the license
   * cache reads. Short timeout: the caller serves its last answer instead.
   */
  async getLicenseStatus(): Promise<unknown> {
    const { data } = await this.client.get('/admin/license', { timeout: 3_000 })
    return (data as { data?: unknown } | undefined)?.data
  }

  // ---- OIDC bearer-token configuration -----------------------------------
  //
  // The issuer, client and rule rows live in the integration-server, next to
  // the verifier that reads them on every request. Proxied here so the admin
  // UI keeps one auth model, exactly as platform config and API keys are.

  async listOAuthIssuers(): Promise<unknown[]> {
    const { data } = await this.client.get('/admin/oauth/issuers')
    return data?.data ?? []
  }

  async getOAuthIssuer(id: string): Promise<unknown> {
    const { data } = await this.client.get(`/admin/oauth/issuers/${encodeURIComponent(id)}`)
    return data?.data
  }

  async createOAuthIssuer(body: Record<string, unknown>): Promise<unknown> {
    const { data } = await this.client.post('/admin/oauth/issuers', body)
    return data?.data
  }

  async updateOAuthIssuer(id: string, body: Record<string, unknown>): Promise<unknown> {
    const { data } = await this.client.patch(`/admin/oauth/issuers/${encodeURIComponent(id)}`, body)
    return data?.data
  }

  async deleteOAuthIssuer(id: string): Promise<void> {
    await this.client.delete(`/admin/oauth/issuers/${encodeURIComponent(id)}`)
  }

  async discoverOAuthIssuer(issuer: string): Promise<{ issuer: string; jwksUri: string }> {
    const { data } = await this.client.post('/admin/oauth/discover', { issuer })
    return data?.data
  }

  async listOAuthPresets(): Promise<unknown[]> {
    const { data } = await this.client.get('/admin/oauth/presets')
    return data?.data ?? []
  }

  async createOAuthClient(issuerId: string, body: Record<string, unknown>): Promise<unknown> {
    const { data } = await this.client.post(
      `/admin/oauth/issuers/${encodeURIComponent(issuerId)}/clients`,
      body,
    )
    return data?.data
  }

  async revokeOAuthClient(id: string): Promise<void> {
    await this.client.delete(`/admin/oauth/clients/${encodeURIComponent(id)}`)
  }

  async createOAuthScopeRule(issuerId: string, body: Record<string, unknown>): Promise<unknown> {
    const { data } = await this.client.post(
      `/admin/oauth/issuers/${encodeURIComponent(issuerId)}/rules`,
      body,
    )
    return data?.data
  }

  async deleteOAuthScopeRule(id: string): Promise<void> {
    await this.client.delete(`/admin/oauth/rules/${encodeURIComponent(id)}`)
  }

  async listConnections(): Promise<VerticalConnection[]> {
    const { data } = await this.client.get('/connections')
    return data.data ?? data ?? []
  }

  async getConnection(id: string): Promise<VerticalConnection | null> {
    try {
      const { data } = await this.client.get(`/connections/${id}`)
      return data.data ?? data
    } catch (err) {
      if (isUpstreamNotFound(err)) return null
      throw err
    }
  }

  /**
   * Rename a connection. `null` clears the label.
   *
   * Only 404 is folded into a value — a duplicate label answers 409 upstream
   * and must stay a throw, so `openapi-setup.ts` relays that status and the
   * operator is told the name is taken rather than that the row vanished.
   */
  async updateConnectionLabel(
    id: string,
    label: string | null,
  ): Promise<VerticalConnection | null> {
    try {
      const { data } = await this.client.patch(`/connections/${id}`, { label })
      return data.data ?? data
    } catch (err) {
      if (isUpstreamNotFound(err)) return null
      throw err
    }
  }

  /**
   * Set a connection's sync schedule. Only 404 folds into null; a 400 stays a
   * throw so `openapi-setup.ts` relays it and the operator learns why.
   */
  async setConnectionSyncSchedule(
    id: string,
    schedule: SyncSchedule,
  ): Promise<VerticalConnection | null> {
    try {
      const { data } = await this.client.put(`/connections/${id}/sync-schedule`, schedule)
      return data.data ?? data
    } catch (err) {
      if (isUpstreamNotFound(err)) return null
      throw err
    }
  }

  async deleteConnection(id: string): Promise<boolean> {
    try {
      await this.client.delete(`/connections/${id}`)
      return true
    } catch (err) {
      if (isUpstreamNotFound(err)) return false
      throw err
    }
  }

  /** Catalog metadata for every known platform (logos, descriptions, auth_type). */
  async listCatalog(): Promise<VerticalPlatform[]> {
    const { data } = await this.client.get('/v1/platforms')
    return data.data ?? data ?? []
  }

  /** Operator-config rows: which platforms are enabled, have config, etc. */
  async listPlatforms(vertical?: string): Promise<PlatformRow[]> {
    const { data } = await this.client.get('/admin/platforms', {
      params: vertical ? { vertical } : undefined,
    })
    return data.data ?? []
  }

  async enablePlatform(
    vertical: string,
    slug: string,
    config?: Record<string, unknown>,
  ): Promise<void> {
    await this.client.post(`/admin/platforms/${vertical}/${slug}/enable`, { config })
  }

  async disablePlatform(vertical: string, slug: string): Promise<void> {
    await this.client.post(`/admin/platforms/${vertical}/${slug}/disable`)
  }

  async setPlatformConfig(
    vertical: string,
    slug: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    await this.client.put(`/admin/platforms/${vertical}/${slug}/config`, { config })
  }

  async getPlatformConfig(vertical: string, slug: string): Promise<PlatformConfigRedacted | null> {
    try {
      const { data } = await this.client.get(`/admin/platforms/${vertical}/${slug}/config`)
      return data.data ?? null
    } catch (err) {
      if (isUpstreamNotFound(err)) return null
      throw err
    }
  }

  // ── End-users (Connect Link customers) ──────────────────────────────────

  /**
   * `sort`/`dir`/`email`/`displayName`/`externalReference` are optional and
   * additive: integration-server's `GET /admin/end-users` (and
   * `EndUserStore.list` underneath it) honours them regardless of whether a
   * caller also asks for `limit`/`offset` — there is no `page` concept at
   * that layer at all, only admin-api's OWN route (`routes/end-users.ts`)
   * distinguishes a `page`-bearing request from this plain one. Existing
   * callers (the `/customers/search.json` autocomplete) don't pass them and
   * are unaffected.
   */
  async listEndUsers(opts?: {
    tenantId?: string
    q?: string
    email?: string
    displayName?: string
    externalReference?: string
    sort?: string
    dir?: string
    limit?: number
    offset?: number
  }): Promise<unknown[]> {
    const { data } = await this.client.get('/admin/end-users', { params: opts })
    return data.data ?? []
  }

  /**
   * Paged variant for the /customers list page — returns the page slice plus
   * the real total, sourced from integration-server's `EndUserStore.countEndUsers`.
   *
   * Before this existed, `/api/end-users?page=` (admin-api's own route) asked
   * for the page by calling `listEndUsers({ tenantId, q })` with NO limit and
   * reading `all.length` as the total — which silently collapsed to
   * `EndUserStore.list`'s own 50-row default (there was no way to ask for
   * "every matching row" through that method), so `meta.total` was capped at
   * 50 no matter how many customers actually existed, and the 51st was
   * unreachable from the admin UI. This method instead asks integration-server
   * for exactly the requested page AND its real count in one round trip.
   *
   * `sort`/`dir`/`email`/`displayName`/`externalReference` are forwarded
   * verbatim to `GET /admin/end-users` — see
   * `packages/shared/src/control-plane/connect-admin-router.ts`, which is the
   * wire contract's only authority, and `EndUserStore.list`/`countEndUsers`
   * underneath it for what each actually matches/orders on.
   */
  async listEndUsersPaged(opts: {
    tenantId?: string
    q?: string
    email?: string
    displayName?: string
    externalReference?: string
    sort?: string
    dir?: string
    limit?: number
    offset?: number
  }): Promise<{ data: unknown[]; meta: { total: number } }> {
    const { data } = await this.client.get('/admin/end-users', { params: opts })
    return { data: data.data ?? [], meta: { total: data.meta?.total ?? (data.data ?? []).length } }
  }

  async getEndUser(id: string, opts?: { includePii?: boolean }): Promise<unknown | null> {
    try {
      const { data } = await this.client.get(`/admin/end-users/${id}`, {
        params: opts?.includePii ? { include_pii: 'true' } : undefined,
      })
      return data.data ?? null
    } catch (err) {
      if (isUpstreamNotFound(err)) return null
      throw err
    }
  }

  async createEndUser(body: Record<string, unknown>): Promise<unknown> {
    const { data } = await this.client.post('/admin/end-users', body)
    return data.data
  }

  async updateEndUser(id: string, body: Record<string, unknown>): Promise<unknown> {
    const { data } = await this.client.patch(`/admin/end-users/${id}`, body)
    return data.data
  }

  async deleteEndUser(id: string): Promise<void> {
    await this.client.delete(`/admin/end-users/${id}`)
  }

  // ── Connect-link sessions ───────────────────────────────────────────────

  async listConnectSessions(opts?: {
    tenantId?: string
    endUserId?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<unknown[]> {
    const { data } = await this.client.get('/admin/connect-sessions', { params: opts })
    return data.data ?? []
  }

  async getConnectSession(id: string): Promise<unknown | null> {
    try {
      const { data } = await this.client.get(`/admin/connect-sessions/${id}`)
      return data.data ?? null
    } catch (err) {
      if (isUpstreamNotFound(err)) return null
      throw err
    }
  }

  async createConnectSession(body: Record<string, unknown>): Promise<unknown> {
    const { data } = await this.client.post('/admin/connect-sessions', body)
    return data.data
  }

  async revokeConnectSession(id: string): Promise<void> {
    await this.client.delete(`/admin/connect-sessions/${id}`)
  }

  // ── Developer API keys ──────────────────────────────────────────────────

  async listApiKeys(tenantId?: string, mode?: 'live' | 'test'): Promise<unknown[]> {
    const params: Record<string, string> = {}
    if (tenantId) params['tenantId'] = tenantId
    if (mode) params['mode'] = mode
    const { data } = await this.client.get('/admin/api-keys', {
      params: Object.keys(params).length > 0 ? params : undefined,
    })
    return data.data ?? []
  }

  async mintApiKey(body: {
    tenantId: string
    label?: string | null
    scopes?: string[]
    mode?: 'live' | 'test'
    expiresAt?: number | null
  }): Promise<unknown> {
    const { data } = await this.client.post('/admin/api-keys', body)
    return data.data
  }

  async rotateApiKey(
    id: string,
    body: { overlapSeconds?: number; expiresAt?: number | null },
  ): Promise<unknown | null> {
    try {
      const { data } = await this.client.post(`/admin/api-keys/${id}/rotate`, body)
      return data.data
    } catch (err) {
      if (isUpstreamNotFound(err)) return null
      throw err
    }
  }

  async revokeApiKey(id: string): Promise<boolean> {
    try {
      await this.client.delete(`/admin/api-keys/${id}`)
      return true
    } catch (err) {
      if (isUpstreamNotFound(err)) return false
      throw err
    }
  }

  // ── End-user tokens (eut_*) ─────────────────────────────────────────────

  async listEndUserTokens(filter: { endUserId?: string; tenantId?: string }): Promise<unknown[]> {
    const { data } = await this.client.get('/admin/end-user-tokens', { params: filter })
    return data.data ?? []
  }

  async mintEndUserToken(body: {
    endUserId: string
    tenantId: string
    label?: string | null
    scopes?: string[]
    createdBy?: string | null
  }): Promise<unknown> {
    const { data } = await this.client.post('/admin/end-user-tokens', body)
    return data.data
  }

  async revokeEndUserToken(id: string): Promise<boolean> {
    try {
      await this.client.delete(`/admin/end-user-tokens/${id}`)
      return true
    } catch (err) {
      if (isUpstreamNotFound(err)) return false
      throw err
    }
  }

  // ── Outbound webhook subscriptions ──────────────────────────────────────

  async listWebhookSubs(tenantId?: string): Promise<unknown[]> {
    const { data } = await this.client.get('/admin/webhook-subscriptions', {
      params: tenantId ? { tenantId } : undefined,
    })
    return data.data ?? []
  }

  async createWebhookSub(body: {
    tenantId: string
    url: string
    label?: string | null
    events?: string[]
    format?: string
    headers?: Record<string, string>
  }): Promise<unknown> {
    const { data } = await this.client.post('/admin/webhook-subscriptions', body)
    return data.data
  }

  /**
   * Changes a subscription's delivery settings. Maps nothing to an empty
   * value, not even a 404: a 400 here carries the reason a header was
   * rejected, and an operator who typed it needs to read it.
   */
  async updateWebhookSub(
    id: string,
    body: { format?: string; headers?: Record<string, string> | null; label?: string | null },
  ): Promise<unknown> {
    const { data } = await this.client.patch(`/admin/webhook-subscriptions/${id}`, body)
    return data.data
  }

  /**
   * Sends one synthetic event to a subscription. Errors propagate: the
   * operator asked a diagnostic question and needs the real answer, and a
   * receiver's rejection comes back as a 200 with `ok: false`, not a throw.
   */
  async testWebhookSub(id: string): Promise<unknown> {
    const { data } = await this.client.post(`/admin/webhook-subscriptions/${id}/test`)
    return data.data
  }

  async deleteWebhookSub(id: string): Promise<boolean> {
    try {
      await this.client.delete(`/admin/webhook-subscriptions/${id}`)
      return true
    } catch (err) {
      if (isUpstreamNotFound(err)) return false
      throw err
    }
  }

  async pauseWebhookSub(id: string, paused: boolean): Promise<boolean> {
    try {
      await this.client.post(`/admin/webhook-subscriptions/${id}/paused`, { paused })
      return true
    } catch (err) {
      if (isUpstreamNotFound(err)) return false
      throw err
    }
  }

  /**
   * Mints a NEW signing secret and returns the plaintext once. `null` means the
   * subscription is gone; anything else throws. The route renders `null` as
   * "Webhook subscription not found.", so collapsing errors into `null` would
   * render every upstream failure as "not found".
   */
  async rotateWebhookSubSecret(id: string): Promise<string | null> {
    try {
      const { data } = await this.client.post(`/admin/webhook-subscriptions/${id}/rotate-secret`)
      return data?.data?.secret ?? null
    } catch (err) {
      if (isUpstreamNotFound(err)) return null
      throw err
    }
  }

  /**
   * `offset`/`sort`/`dir`/`eventType`/`eventId` are optional and additive:
   * integration-server's `GET /admin/webhook-subscriptions/:id/deliveries`
   * (and `WebhookDeliveryStore.listForSubscription` underneath it) honours
   * them regardless of whether a caller also asks for `limit` — existing
   * callers don't pass them and are unaffected. Same shape as
   * `listEndUsers`'s own doc comment.
   */
  async listWebhookDeliveries(
    subscriptionId: string,
    opts?: {
      status?: 'pending' | 'delivered' | 'dead'
      eventType?: string
      eventId?: string
      sort?: string
      dir?: string
      limit?: number
      offset?: number
    },
  ): Promise<unknown[]> {
    const { data } = await this.client.get(
      `/admin/webhook-subscriptions/${subscriptionId}/deliveries`,
      { params: opts },
    )
    return data.data ?? []
  }

  /**
   * Paged variant for the `/webhooks/:id/deliveries` admin list page —
   * returns the page slice plus the real total, sourced from
   * integration-server's `WebhookDeliveryStore.countForSubscription`.
   *
   * Before this existed, admin-api's own `GET /api/webhook-subscriptions/:id/deliveries`
   * route asked upstream via the bare `listWebhookDeliveries` above with
   * NO `limit`/`offset` — which silently collapsed to that method's own
   * 50-row default (there was no way to ask for "every matching row"
   * through it) — and read `all.length` as the total, so `meta.total` was
   * capped at 50 no matter how many deliveries actually existed, and
   * `?page=2` always sliced past the end of that 50-row array. This method
   * instead asks integration-server for exactly the requested page AND its
   * real count in one round trip. See
   * `packages/shared/src/control-plane/webhook-subs-admin-router.ts`, which
   * is the wire contract's only authority, and
   * `WebhookDeliveryStore.listForSubscription`/`countForSubscription`
   * underneath it for what each actually matches/orders on.
   */
  async listWebhookDeliveriesPaged(
    subscriptionId: string,
    opts: {
      status?: 'pending' | 'delivered' | 'dead'
      eventType?: string
      eventId?: string
      sort?: string
      dir?: string
      limit?: number
      offset?: number
    },
  ): Promise<{ data: unknown[]; meta: { total: number } }> {
    const { data } = await this.client.get(
      `/admin/webhook-subscriptions/${subscriptionId}/deliveries`,
      { params: opts },
    )
    return { data: data.data ?? [], meta: { total: data.meta?.total ?? (data.data ?? []).length } }
  }

  async replayWebhookDelivery(subscriptionId: string, deliveryId: string): Promise<unknown | null> {
    try {
      const { data } = await this.client.post(
        `/admin/webhook-subscriptions/${subscriptionId}/deliveries/${deliveryId}/replay`,
      )
      return data.data ?? null
    } catch (err) {
      if (isUpstreamNotFound(err)) return null
      throw err
    }
  }

  // ── Data-store sync jobs (admin view) ───────────────────────────────────

  /**
   * One page of sync jobs plus the number of rows matching the filter.
   *
   * `total` comes from integration-server's own COUNT (`meta.total`), not from
   * `data.length`: the old shape asked for `page * limit + 1` rows and read
   * that window's length as the total, which capped the whole table at 200
   * rows and made row 201 unreachable from the admin UI.
   *
   * The `?? length` fallback keeps a mixed-version deployment honest rather
   * than reporting `undefined` — an integration-server predating `meta` still
   * answers a page, and reporting its size is the same (truncated) answer that
   * build gave before, not a new lie.
   */
  async listSyncJobs(opts?: {
    vertical?: string
    connection_id?: string
    status?: string
    platform?: string
    tenant_id?: string
    id?: string
    connection_id_contains?: string
    sort?: string
    dir?: string
    limit?: number
    offset?: number
  }): Promise<{ data: unknown[]; total: number }> {
    const { data } = await this.client.get('/admin/sync-jobs', { params: opts })
    const rows = data.data ?? []
    return { data: rows, total: data.meta?.total ?? rows.length }
  }

  async getSyncJob(id: string): Promise<unknown | null> {
    try {
      const { data } = await this.client.get(`/admin/sync-jobs/${id}`)
      return data.data ?? null
    } catch (err) {
      if (isUpstreamNotFound(err)) return null
      throw err
    }
  }

  /**
   * Requests cancellation. `null` is only "no such job"; "running but not in a
   * cancelable state" comes back from upstream as a 409 and now keeps that
   * status, which is what tells the operator to wait rather than to go hunting
   * for a job id that was never wrong.
   */
  async cancelSyncJob(id: string): Promise<unknown | null> {
    try {
      const { data } = await this.client.post(`/admin/sync-jobs/${id}/cancel`)
      return data.data ?? null
    } catch (err) {
      if (isUpstreamNotFound(err)) return null
      throw err
    }
  }

  /**
   * Enqueue a sync. Unlike its read-only neighbours there is no "no such row"
   * answer to report here, so nothing maps to an empty value and every refusal
   * throws: the caller has to distinguish "already running" (409) from
   * "unknown connection" (404) from "this deployment has no sync engine"
   * (route absent in passthrough mode). Collapsing all three into `null`
   * produced one generic 500 and trained operators to ignore the button.
   */
  async createSyncJob(connectionId: string, callbackUrl?: string): Promise<unknown> {
    const { data } = await this.client.post('/admin/sync-jobs', {
      connection_id: connectionId,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    })
    return data.data ?? null
  }

  // ---- Stored data (admin data viewer + dashboards) ----------------------
  //
  // integration-server's `/admin/data/*` routes re-check every request
  // against the caller scope sent in `X-OpenSteward-Data-Scope` — the
  // operator's tenants, whether this request may reveal PII, whether financial
  // fields are masked. Nothing here folds a failure into an empty value: a 404
  // (unknown or out-of-scope connection), 409 (passthrough mode) or 400
  // (a filter on a field this scope may not search) reaches the route, which
  // passes it through with integration-server's own code.

  private dataHeaders(scope: DataScopeHeader) {
    return { [DATA_SCOPE_HEADER]: JSON.stringify(scope) }
  }

  async getDataSummary(scope: DataScopeHeader): Promise<{ data: unknown[] }> {
    const { data } = await this.client.get('/admin/data/summary', {
      headers: this.dataHeaders(scope),
    })
    return { data: data?.data ?? [] }
  }

  async getDataSchema(scope: DataScopeHeader, vertical: string, type: string): Promise<unknown> {
    const { data } = await this.client.get(
      `/admin/data/schema/${encodeURIComponent(vertical)}/${encodeURIComponent(type)}`,
      { headers: this.dataHeaders(scope) },
    )
    return data?.data
  }

  async listDataRecords(
    scope: DataScopeHeader,
    connectionId: string,
    type: string,
    query: Record<string, string | undefined>,
  ): Promise<{ data: unknown[]; meta: Record<string, unknown> }> {
    const { data } = await this.client.get(
      `/admin/data/connections/${encodeURIComponent(connectionId)}/resources/${encodeURIComponent(type)}`,
      { headers: this.dataHeaders(scope), params: query },
    )
    return { data: data?.data ?? [], meta: data?.meta ?? {} }
  }

  async getDataRecord(
    scope: DataScopeHeader,
    connectionId: string,
    type: string,
    rid: string,
    reveal: boolean,
  ): Promise<{ data: Record<string, unknown>; meta: Record<string, unknown> }> {
    const { data } = await this.client.get(
      `/admin/data/connections/${encodeURIComponent(connectionId)}/resources/${encodeURIComponent(type)}/${encodeURIComponent(rid)}`,
      { headers: this.dataHeaders(scope), params: reveal ? { reveal: 'pii' } : undefined },
    )
    return { data: data?.data ?? {}, meta: data?.meta ?? {} }
  }

  /**
   * Open an export stream. Resolves once integration-server has answered with
   * headers; the body is the upstream stream, piped through untouched. An
   * error status is read to the end and thrown as an axios-shaped error, so
   * the caller sees the upstream `{ error: { code, message } }` rather than a
   * stream it would have to drain itself.
   */
  async openDataExport(
    scope: DataScopeHeader,
    connectionId: string,
    type: string,
    query: Record<string, string | undefined>,
  ): Promise<{ stream: Readable; headers: Record<string, string> }> {
    const res = await this.client.get(
      `/admin/data/connections/${encodeURIComponent(connectionId)}/resources/${encodeURIComponent(type)}/export`,
      {
        headers: this.dataHeaders(scope),
        params: query,
        responseType: 'stream',
        // The first byte arrives only after the first page is read; the body
        // itself may take minutes. No overall timeout on a stream.
        timeout: 0,
        validateStatus: () => true,
      },
    )
    const stream = res.data as Readable
    if (res.status >= 400) {
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
      let body: unknown = null
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        body = null
      }
      throw Object.assign(new Error(`Request failed with status code ${res.status}`), {
        isAxiosError: true,
        status: res.status,
        response: { status: res.status, data: body, headers: {} },
      })
    }
    const headers: Record<string, string> = {}
    for (const key of ['content-type', 'content-disposition', 'x-opensteward-export-max-rows']) {
      const v = (res.headers as Record<string, unknown>)[key]
      if (typeof v === 'string') headers[key] = v
    }
    return { stream, headers }
  }

  async listDataMetrics(scope: DataScopeHeader): Promise<unknown[]> {
    const { data } = await this.client.get('/admin/data/metrics', {
      headers: this.dataHeaders(scope),
    })
    return data?.data ?? []
  }

  /**
   * One metric. `currency` keeps only that currency, `granularity` sets the
   * buckets of a series over time, `compare` adds the prior equal-length
   * range, and `connection` / `platform` narrow the scope's connections to
   * one connection / one adapter; each is sent only when set, so
   * integration-server's defaults apply otherwise (and its cache key stays
   * the same for the same request).
   */
  async getDataMetric(
    scope: DataScopeHeader,
    id: string,
    params: {
      from?: string
      to?: string
      currency?: string
      granularity?: string
      compare?: boolean
      connection?: string
      platform?: string
      vertical?: string
    },
  ): Promise<unknown> {
    const query: Record<string, string> = {}
    if (params.from) query['from'] = params.from
    if (params.to) query['to'] = params.to
    if (params.currency) query['currency'] = params.currency
    if (params.granularity) query['granularity'] = params.granularity
    if (params.compare) query['compare'] = '1'
    if (params.connection) query['connection'] = params.connection
    if (params.platform) query['platform'] = params.platform
    if (params.vertical) query['vertical'] = params.vertical
    const { data } = await this.client.get(`/admin/data/metrics/${encodeURIComponent(id)}`, {
      headers: this.dataHeaders(scope),
      params: query,
    })
    return data?.data
  }

  /** Distinct currencies across the in-scope money and currency fields, sorted. */
  async listDataCurrencies(
    scope: DataScopeHeader,
    filter: { connection?: string; platform?: string; vertical?: string } = {},
  ): Promise<string[]> {
    const params: Record<string, string> = {}
    if (filter.connection) params['connection'] = filter.connection
    if (filter.platform) params['platform'] = filter.platform
    if (filter.vertical) params['vertical'] = filter.vertical
    const { data } = await this.client.get('/admin/data/currencies', {
      headers: this.dataHeaders(scope),
      params,
    })
    return Array.isArray(data?.data) ? (data.data as string[]) : []
  }

  async getDataStoreMetrics(): Promise<unknown | null> {
    try {
      const { data } = await this.client.get('/health/data-store')
      return data
    } catch {
      return null
    }
  }

  // ---- Destinations (`/admin/destinations/*`) -----------------------------
  //
  // Same scope header as the data viewer: integration-server shows and
  // changes only destinations whose scope lies inside the caller's, and
  // refuses (403) a write that would widen one. Every failure is thrown so
  // the route can pass integration-server's own status and code through.

  async listDestinationTypes(): Promise<unknown[]> {
    const { data } = await this.client.get('/admin/destinations/types')
    return data?.data ?? []
  }

  async listDestinations(scope: DataScopeHeader): Promise<unknown[]> {
    const { data } = await this.client.get('/admin/destinations', {
      headers: this.dataHeaders(scope),
    })
    return data?.data ?? []
  }

  async getDestination(scope: DataScopeHeader, id: string): Promise<Record<string, unknown>> {
    const { data } = await this.client.get(`/admin/destinations/${encodeURIComponent(id)}`, {
      headers: this.dataHeaders(scope),
    })
    return data?.data ?? {}
  }

  async createDestination(
    scope: DataScopeHeader,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { data } = await this.client.post('/admin/destinations', body, {
      headers: this.dataHeaders(scope),
    })
    return data?.data ?? {}
  }

  async updateDestination(
    scope: DataScopeHeader,
    id: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { data } = await this.client.patch(
      `/admin/destinations/${encodeURIComponent(id)}`,
      body,
      { headers: this.dataHeaders(scope) },
    )
    return data?.data ?? {}
  }

  async deleteDestination(scope: DataScopeHeader, id: string): Promise<void> {
    await this.client.delete(`/admin/destinations/${encodeURIComponent(id)}`, {
      headers: this.dataHeaders(scope),
    })
  }

  async setDestinationCredentials(
    scope: DataScopeHeader,
    id: string,
    body: { secrets: Record<string, string>; actor: string },
  ): Promise<Record<string, unknown>> {
    const { data } = await this.client.put(
      `/admin/destinations/${encodeURIComponent(id)}/credentials`,
      body,
      { headers: this.dataHeaders(scope) },
    )
    return data?.data ?? {}
  }

  async testDestination(
    scope: DataScopeHeader,
    id: string,
  ): Promise<{ ok: boolean; error?: string; latencyMs: number }> {
    const { data } = await this.client.post(
      `/admin/destinations/${encodeURIComponent(id)}/test`,
      {},
      // A connection test dials the operator's bucket or database.
      { headers: this.dataHeaders(scope), timeout: 60_000 },
    )
    return data?.data
  }

  async runDestination(scope: DataScopeHeader, id: string): Promise<{ runId: string }> {
    const { data } = await this.client.post(
      `/admin/destinations/${encodeURIComponent(id)}/run`,
      {},
      { headers: this.dataHeaders(scope) },
    )
    return data?.data
  }

  async backfillDestination(
    scope: DataScopeHeader,
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ cursorsReset: number; runId: string | null }> {
    const { data } = await this.client.post(
      `/admin/destinations/${encodeURIComponent(id)}/backfill`,
      body,
      { headers: this.dataHeaders(scope) },
    )
    return data?.data
  }

  async listDestinationRuns(
    scope: DataScopeHeader,
    id: string,
    limit?: number,
  ): Promise<unknown[]> {
    const { data } = await this.client.get(`/admin/destinations/${encodeURIComponent(id)}/runs`, {
      headers: this.dataHeaders(scope),
      params: limit !== undefined ? { limit } : undefined,
    })
    return data?.data ?? []
  }

  // ---- Read-only SQL access (`/admin/analytics/*`) ------------------------
  //
  // Postgres only: on SQLite every route but `status` answers 409
  // POSTGRES_REQUIRED, which reaches the caller unchanged. Passwords in the
  // create / rotate answers pass through once and are never kept here.

  async getAnalyticsStatus(): Promise<Record<string, unknown>> {
    const { data } = await this.client.get('/admin/analytics/status')
    return data?.data ?? {}
  }

  async getAnalyticsCatalog(scope: DataScopeHeader): Promise<Record<string, unknown>> {
    const { data } = await this.client.get('/admin/analytics/catalog', {
      headers: this.dataHeaders(scope),
    })
    return data?.data ?? {}
  }

  async provisionAnalytics(scope: DataScopeHeader): Promise<Record<string, unknown>> {
    const { data } = await this.client.post(
      '/admin/analytics/provision',
      {},
      // Provisioning runs DDL for every view in one transaction.
      { headers: this.dataHeaders(scope), timeout: 120_000 },
    )
    return data?.data ?? {}
  }

  async getAnalyticsProvisionScript(scope: DataScopeHeader): Promise<string> {
    const { data } = await this.client.get('/admin/analytics/provision-script', {
      headers: this.dataHeaders(scope),
      responseType: 'text',
      timeout: 60_000,
    })
    return typeof data === 'string' ? data : String(data ?? '')
  }

  async listAnalyticsPrincipals(scope: DataScopeHeader): Promise<unknown[]> {
    const { data } = await this.client.get('/admin/analytics/principals', {
      headers: this.dataHeaders(scope),
    })
    return data?.data ?? []
  }

  async createAnalyticsPrincipal(
    scope: DataScopeHeader,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { data } = await this.client.post('/admin/analytics/principals', body, {
      headers: this.dataHeaders(scope),
      timeout: 30_000,
    })
    return data?.data ?? {}
  }

  async rotateAnalyticsPrincipal(
    scope: DataScopeHeader,
    id: string,
  ): Promise<Record<string, unknown>> {
    const { data } = await this.client.post(
      `/admin/analytics/principals/${encodeURIComponent(id)}/rotate`,
      {},
      { headers: this.dataHeaders(scope), timeout: 30_000 },
    )
    return data?.data ?? {}
  }

  async revokeAnalyticsPrincipal(
    scope: DataScopeHeader,
    id: string,
  ): Promise<Record<string, unknown>> {
    const { data } = await this.client.delete(
      `/admin/analytics/principals/${encodeURIComponent(id)}`,
      { headers: this.dataHeaders(scope), timeout: 30_000 },
    )
    return data?.data ?? {}
  }
}
