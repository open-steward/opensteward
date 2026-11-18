import axios, { type AxiosInstance } from 'axios'
import { scrubUpstreamError } from './scrub-upstream-error.js'
import type {
  ChartType,
  CompanyInfo,
  CompanyInfoRecord,
  GranularityParam,
  MetricKind,
  MetricSection,
  MetricUnit,
} from '@opensteward/shared'
import type { ConnectionSyncState, SyncMode, SyncSchedule } from '@opensteward/shared'
import type {
  DestinationBackfillInput,
  DestinationBackfillRecord,
  DestinationInput,
  DestinationRecord,
  DestinationRunRecord,
  DestinationTestRecord,
  DestinationTypeRecord,
  SqlAccessStatusRecord,
  SqlCatalogRecord,
  SqlPrincipalInput,
  SqlPrincipalRecord,
  SqlPrincipalSecretRecord,
  SqlProvisionRecord,
  SqlRevokeRecord,
} from './data-platform-types.js'

export type { CompanyInfo, CompanyInfoRecord }

/**
 * Set on a platform row when it cannot be enabled or connected today — it
 * stays listed and viewable, never offered a Configure/Enable action.
 * Structural, not imported: mirrors `@opensteward/shared`'s
 * `UnsupportedPlatform` (`packages/shared/src/reference/platform-status.ts`)
 * without a dependency on it, matching `@opensteward/platforms-ui`'s
 * `PlatformEntry.unsupported`.
 */
export interface UnsupportedPlatformInfo {
  /** Why the platform cannot be connected today. */
  reason: string
  /** Tracking issue, e.g. https://github.com/open-steward/opensteward/issues/<n> */
  issueUrl?: string
}

/** Pagination metadata returned alongside every admin-API list response. */
export interface PageMeta {
  page: number
  limit: number
  total: number
}

export interface VerticalStatus {
  name: string
  status: 'up' | 'down'
  adapterCount: number
  error?: string
}

export interface TaggedConnection {
  id: string
  platform: string
  tenantId: string | null
  label: string | null
  status: string
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  vertical: string
  /** Most recent refresh attempt (ISO 8601) by the keep-alive worker or the
   *  on-request refresh path. NULL when neither has run. */
  lastRefreshAt: string | null
  /** Outcome of the most recent refresh attempt:
   *  - 'ok'             — succeeded
   *  - 'failed'         — transient error; retry next tick
   *  - 'expired'        — hard failure; the CUSTOMER must re-authorize via
   *                       `/auth/{vertical}/{platform}/connect`.
   *  - 'platform_error' — the platform's OAuth client credentials were
   *                       rejected; the OPERATOR must fix the client
   *                       id/secret. Customer re-authorization will not help.
   *  Fourth member matches the store (`packages/shared/src/auth/store.ts`)
   *  and admin-api's own copy (`apps/admin-api/src/core/proxy/client.ts`) —
   *  this was the third stale two-value copy of the same enum, caught in
   *  Task 2's review. */
  lastRefreshStatus: 'ok' | 'failed' | 'expired' | 'platform_error' | null
  /** How often the connection is re-synced; see `ConnectionSyncSchedule` in admin-api. */
  syncMode?: SyncMode
  syncIntervalMinutes?: number | null
  /** Last/next sync as the scheduler sees them; null in passthrough mode. */
  sync?: ConnectionSyncState | null
}

export interface TaggedPlatform {
  slug: string
  name: string
  authType?: string
  category?: string
  website?: string
  vertical: string
}

export interface NotificationRow {
  id: number
  type: string
  vertical: string | null
  connectionId: string | null
  platform: string | null
  message: string
  acknowledged: number
  createdAt: string
}

/** A cleared dashboard task — `GET /api/dashboard-tasks/dismissals`. */
export interface DashboardDismissalRecord {
  key: string
  fingerprint: string
  /** Id of the user who cleared it. */
  by: string
  /** When it was cleared — ISO 8601, like every `createdAt` admin-api emits. */
  createdAt: string
}

export interface AuditEntry {
  id: number
  userId: string
  /** Resolved at read time; falls back to the id for a deleted account. */
  username?: string
  action: string
  vertical: string | null
  targetId: string | null
  detail: string | null
  createdAt: string
}

/** Query filters for the audit list/export endpoints. */
export interface AuditFilter {
  action?: string
  user_id?: string
  /** Exact match on the acted-on id — "everything that happened to X". */
  target_id?: string
  /** Case-insensitive substring match on the vertical the action touched. */
  vertical?: string
  /** Inclusive lower bound — ISO-8601 or epoch-ms string. */
  from?: string
  /** Inclusive upper bound — ISO-8601 or epoch-ms string. */
  to?: string
}

export interface SchemaStatusEntry {
  /** Filename (basename) of the db, e.g. `admin.db`. */
  db: string
  /** Absolute filesystem path on the admin-api host. */
  path: string
  /** True when the file exists on disk; false on a fresh install. */
  exists: boolean
  /** One row per (namespace, version) tracked in `_schema_migrations`. */
  rows: Array<{ namespace: string; version: number; appliedAt: string }>
}

/**
 * `GET /api/license` (admin role): integration-server's license verdict as
 * admin-api last read it (admin-api's `LicenseStatus` component). Never contains
 * the license token. Times are ISO-8601 strings.
 */
export interface LicenseStatusRecord {
  state: 'VALID' | 'EXPIRING' | 'GRACE' | 'DEGRADED' | 'INVALID' | 'MISSING'
  /** Why INVALID (e.g. BAD_SIGNATURE, FILE_UNREADABLE) or DEGRADED (EXPIRED). */
  reason?: string
  source: 'env' | 'file' | 'none'
  /** The file integration-server read or looked for, inside its container. */
  filePath?: string
  /**
   * The license file integration-server ignores because OPENSTEWARD_LICENSE is set
   * (source 'env'): a renewal written to it changes nothing until the env value is removed.
   */
  shadowedFile?: string
  licenseId?: string
  org?: string
  /** Plan name, display only. */
  tier?: string
  label?: string
  env?: string
  kid?: string
  features: string[]
  limits: { connections: number; tenants: number }
  issuedAt?: string
  expiresAt?: string
  daysRemaining?: number
  entitlementSource: 'license' | 'community'
  clockRollbackDetected: boolean
  revocationList: 'ok' | 'missing' | 'invalid'
  evaluatedAt: string
  renewalUrl: string
  usage: { connections: number | null; tenants: number }
  graceEndsAt?: string
  stale: boolean
  fetchedAt: string
}

export interface ApiUser {
  id: string
  username: string
  /** Optional email address (PII — never log it). */
  email?: string | null
  /** Short content hash of the profile picture; null/absent without one.
   *  The UI serves pictures itself, at `/users/:id/avatar?v=<version>`. */
  avatarVersion?: string | null
  role: 'admin' | 'operator' | 'viewer'
  /** Effective role id (custom role id, or the built-in id). */
  roleId?: string
  roleName?: string
  scopeMode?: 'all' | 'restricted'
  createdAt?: string
}

/** One tenant a scoped console user may see; `verticals: '*'` = every vertical. */
export interface ScopeGrantRecord {
  tenantId: string
  verticals: '*' | string[]
}

export interface AccessScopeRecord {
  mode: 'all' | 'restricted'
  grants: ScopeGrantRecord[]
}

/** The caller's effective access, from `GET /api/auth/me`. */
export interface MyAccess {
  roleId: string
  roleName: string
  permissions: string[]
  scope: AccessScopeRecord
  /** Profile-picture version for the header avatar; null without one. */
  avatarVersion?: string | null
}

/** A profile picture proxied from admin-api (`GET /api/users/:id/avatar`). */
export interface UserAvatarResponse {
  /** 304 when the caller's `If-None-Match` still matches. */
  status: 200 | 304
  bytes: Buffer
  contentType: string | null
  etag: string | null
}

/** A built-in or custom role (`GET /api/roles`). */
export interface RoleRecord {
  id: string
  name: string
  description: string | null
  baseRole: 'admin' | 'operator' | 'viewer'
  permissions: string[]
  isBuiltin: boolean
  createdAt: string
  updatedAt: string
  updatedBy: string | null
}

/** One entry of `GET /api/permissions`. */
export interface PermissionRecord {
  id: string
  description: string
  builtinRoles: Array<'admin' | 'operator' | 'viewer'>
}

export interface EndUserTokenRow {
  id: string
  endUserId: string
  tenantId: string
  prefix: string
  label: string | null
  scopes: string[]
  createdAt: string
  createdBy: string | null
  lastUsedAt: string | null
  revokedAt: string | null
}

export interface EndUserTokenMintResult {
  id: string
  endUserId: string
  tenantId: string
  prefix: string
  label: string | null
  scopes: string[]
  plaintext: string
  createdAt: string
}

export interface RuntimeSettingRow {
  key: string
  value: unknown
  valueType: 'number' | 'boolean' | 'string' | 'json'
  defaultValue: unknown
  description: string
  category: string
  updatedAt: string
  updatedBy: string | null
  isDefault: boolean
  /** Legal values for a string setting, or null when free-form. */
  enumValues?: string[] | null
  warning?: string | null
  /** Direction the warning guards: 'enable' (default) or 'disable'. */
  warnOn?: 'enable' | 'disable' | null
}

export interface LogoStatus {
  count: number
  totalBytes: number
  lastFetchedAt: string | null
}

export interface LogoFetchVerticalProgress {
  total: number
  processed: number
  fetched: number
  skipped: number
  notFound: number
}

export interface LogoFetchProgress {
  total: number
  processed: number
  fetched: number
  skipped: number
  notFound: number
  throttled: number
  currentSlug: string | null
  currentVertical: string | null
  etaMs: number | null
  byVertical: Record<string, LogoFetchVerticalProgress>
  lastError: string | null
}

export interface LogoFetchJob {
  id: string
  status: 'pending' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled'
  force: boolean
  vertical: string | null
  slug: string | null
  delayMs: number
  total: number
  progress: LogoFetchProgress | null
  error: string | null
  workerId: string | null
  attempts: number
  heartbeatAt: string | null
  createdAt: string
  createdBy: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface IdentityLinkView {
  providerId: string
  providerName: string | null
  /** Null unless the caller revealed it; absent from the payload otherwise. */
  externalId: string | null
  lastLoginAt: string | null
  scimManaged: boolean
}

export interface UserDetail {
  id: string
  username: string
  email?: string | null
  /** `manual` (an admin set it) or `idp` (copied from the identity provider). */
  emailSource?: 'manual' | 'idp' | null
  avatarVersion?: string | null
  /** `upload` or `idp`; null without a picture. */
  avatarSource?: 'upload' | 'idp' | null
  role: string
  roleId?: string
  roleName?: string
  scope?: AccessScopeRecord
  scopeSource?: 'manual' | 'idp'
  createdAt: string
  updatedAt: string
  links: IdentityLinkView[]
  ssoOnly: boolean
  isLocalAdmin: boolean
  isPinnedBreakGlass: boolean
}

export interface LoginResult {
  token: string
  user: ApiUser
}

/**
 * AdminApiClient — single HTTP client that calls the Admin API (localhost:3001)
 * instead of calling individual verticals directly.
 */
export interface OAuthIssuerRecord {
  id: string
  name: string
  preset: string
  issuer: string
  jwksUri: string
  audience: string
  subjectClaim: string
  scopeClaim: string
  algorithms: string[]
  authorityMode: 'registry' | 'intersect' | 'external'
  tenantClaim: string | null
  allowedTenants: string[]
  maxTokenLifetimeS: number
  enabled: boolean
  lastVerifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface OAuthClientRecord {
  id: string
  issuerId: string
  subject: string
  tenantId: string
  label: string | null
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export interface OAuthScopeRuleRecord {
  id: string
  issuerId: string
  priority: number
  claimValue: string
  grantedScope: string
}

export interface OAuthIssuerDetailRecord {
  issuer: OAuthIssuerRecord
  clients: OAuthClientRecord[]
  rules: OAuthScopeRuleRecord[]
}

export interface OAuthPresetRecord {
  id: string
  label: string
  issuerHint: string
  subjectClaim: string
  scopeClaim: string
  note?: string
}

export class AdminApiClient {
  private client: AxiosInstance

  constructor(baseUrl: string, timeout = 10_000) {
    this.client = axios.create({ baseURL: baseUrl, timeout })
    // Normalise every failed admin-API call: tag it with the correlation id the
    // API returns (`requestId` body field / `X-Request-Id` header) for the error
    // page, surface the upstream reason as the message, and strip the request
    // echo that would otherwise log the operator's client secret and the session
    // JWT. `.response` (and its `.status`) is preserved — handlers that sniff
    // for 404 keep working. Optional-chained so a minimal mocked axios instance
    // (in unit tests) without `interceptors` doesn't break construction.
    this.client.interceptors?.response?.use(
      (res) => res,
      (err: unknown) => Promise.reject(scrubUpstreamError(err)),
    )
  }

  private authHeaders(token: string) {
    return { Authorization: `Bearer ${token}` }
  }

  /**
   * The one rule every `get*` below follows: **404 is an answer, everything
   * else is a failure.**
   *
   * The routes render null as "not found", so a blanket `catch { return
   * null }` would render an unreachable admin-api as "record deleted": the
   * operator would be told their API key had been deleted, their connection
   * did not exist, and their sync job had been pruned — three different wrong
   * sentences from one swallow.
   * The two outcomes have to stay apart: `null` means the record is genuinely
   * gone and the page should say so; a throw means we could not ask, and
   * server.ts's error handler renders the upstream status, message and
   * requestId instead.
   *
   * Only 404 collapses. A 502 from a proxy in front of admin-api is not a
   * missing record.
   */
  private static nullOn404(err: unknown): null {
    if ((err as { response?: { status?: number } })?.response?.status === 404) return null
    throw err
  }

  // ── Auth ────────────────────────────────────────────────

  async login(username: string, password: string): Promise<LoginResult> {
    const { data } = await this.client.post('/api/auth/login', { username, password })
    return data
  }

  async setup(username: string, password: string, bootstrapToken?: string): Promise<LoginResult> {
    // Forward the operator-entered bootstrap token if the deployment is gated.
    const config = bootstrapToken ? { headers: { 'X-Bootstrap-Token': bootstrapToken } } : undefined
    const { data } = await this.client.post('/api/auth/setup', { username, password }, config)
    return data
  }

  async me(token: string): Promise<ApiUser> {
    const { data } = await this.client.get('/api/auth/me', { headers: this.authHeaders(token) })
    return data.user
  }

  /** The signed-in user's own profile (name, email, picture version) for
   *  the /profile page. Null when admin-api has no such user. */
  async getMyProfile(token: string): Promise<ApiUser | null> {
    try {
      const { data } = await this.client.get('/api/auth/me', { headers: this.authHeaders(token) })
      return data?.user ?? null
    } catch (err) {
      return AdminApiClient.nullOn404(err)
    }
  }

  /**
   * The caller's permissions and tenant scope. Null when admin-api predates
   * the permission model (no `permissions` on `/api/auth/me`) — the caller
   * then falls back to the built-in set for the session's role.
   */
  async getMyAccess(token: string): Promise<MyAccess | null> {
    const { data } = await this.client.get('/api/auth/me', { headers: this.authHeaders(token) })
    const u = data?.user
    if (!u || !Array.isArray(u.permissions)) return null
    return {
      roleId: String(u.roleId ?? u.role),
      roleName: String(u.roleName ?? u.role),
      permissions: u.permissions,
      scope: u.scope ?? { mode: 'all', grants: [] },
      avatarVersion: typeof u.avatarVersion === 'string' ? u.avatarVersion : null,
    }
  }

  // ── Roles & permissions ─────────────────────────────────

  async listPermissions(token: string): Promise<PermissionRecord[]> {
    const { data } = await this.client.get('/api/permissions', { headers: this.authHeaders(token) })
    return data.data ?? []
  }

  async listRoles(token: string): Promise<RoleRecord[]> {
    const { data } = await this.client.get('/api/roles', { headers: this.authHeaders(token) })
    return data.data ?? []
  }

  async getRole(token: string, id: string): Promise<RoleRecord | null> {
    try {
      const { data } = await this.client.get(`/api/roles/${encodeURIComponent(id)}`, {
        headers: this.authHeaders(token),
      })
      return data.data
    } catch (err) {
      return AdminApiClient.nullOn404(err)
    }
  }

  async createRole(
    token: string,
    body: { name: string; description?: string | null; baseRole: string; permissions: string[] },
  ): Promise<RoleRecord> {
    const { data } = await this.client.post('/api/roles', body, { headers: this.authHeaders(token) })
    return data.data
  }

  async updateRole(
    token: string,
    id: string,
    body: { name?: string; description?: string | null; baseRole?: string; permissions?: string[] },
  ): Promise<RoleRecord> {
    const { data } = await this.client.patch(`/api/roles/${encodeURIComponent(id)}`, body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  /** Throws on refusal — a built-in or in-use role answers 409. */
  async deleteRole(token: string, id: string): Promise<void> {
    await this.client.delete(`/api/roles/${encodeURIComponent(id)}`, {
      headers: this.authHeaders(token),
    })
  }

  async assignUserRole(token: string, userId: string, roleId: string): Promise<ApiUser> {
    const { data } = await this.client.put(
      `/api/users/${encodeURIComponent(userId)}/role`,
      { roleId },
      { headers: this.authHeaders(token) },
    )
    return data.data
  }

  async setUserScope(
    token: string,
    userId: string,
    body: { mode: 'all' | 'restricted'; grants?: ScopeGrantRecord[]; source?: 'manual' | 'idp' },
  ): Promise<AccessScopeRecord & { source: 'manual' | 'idp' }> {
    const { data } = await this.client.put(`/api/users/${encodeURIComponent(userId)}/scope`, body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  // ── SSO / identity providers ────────────────────────────

  async getLoginOptions(): Promise<{
    providers: PublicIdentityProvider[]
    localLoginEnabled: boolean
  }> {
    const { data } = await this.client.get('/api/sso/login-options')
    return data.data
  }

  async ldapLogin(slug: string, username: string, password: string): Promise<LoginResult> {
    const { data } = await this.client.post(`/api/sso/${encodeURIComponent(slug)}/ldap-login`, {
      username,
      password,
    })
    return data
  }

  async exchangeSsoHandoff(code: string): Promise<LoginResult> {
    const { data } = await this.client.post('/api/sso/handoff/exchange', { code })
    return data
  }

  async listIdentityProviders(token: string): Promise<IdentityProviderRecord[]> {
    const { data } = await this.client.get('/api/identity-providers', {
      headers: this.authHeaders(token),
    })
    return data.data ?? []
  }

  async getIdentityProvider(token: string, id: string): Promise<IdentityProviderRecord | null> {
    try {
      const { data } = await this.client.get(`/api/identity-providers/${id}`, {
        headers: this.authHeaders(token),
      })
      return data.data
    } catch (err) {
      return AdminApiClient.nullOn404(err)
    }
  }

  async createIdentityProvider(
    token: string,
    body: Record<string, unknown>,
  ): Promise<IdentityProviderRecord> {
    const { data } = await this.client.post('/api/identity-providers', body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async updateIdentityProvider(
    token: string,
    id: string,
    body: Record<string, unknown>,
  ): Promise<IdentityProviderRecord> {
    const { data } = await this.client.put(`/api/identity-providers/${id}`, body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  /**
   * Throws on refusal rather than returning a boolean. Every caller is
   * `await client.deleteX(...)` followed by a redirect, so a boolean return
   * would let a refusal — a 400 "cannot delete yourself", a 502, an
   * unreachable admin-api — produce the exact page a success produces: the
   * record still there and nothing on screen saying why.
   */
  async deleteIdentityProvider(token: string, id: string): Promise<void> {
    await this.client.delete(`/api/identity-providers/${id}`, {
      headers: this.authHeaders(token),
    })
  }

  async getProviderMetadata(token: string, id: string): Promise<string> {
    const { data } = await this.client.get(`/api/identity-providers/${id}/metadata`, {
      headers: this.authHeaders(token),
      responseType: 'text',
    })
    return typeof data === 'string' ? data : String(data)
  }

  async listRoleMappings(token: string, id: string): Promise<RoleMappingRecord[]> {
    const { data } = await this.client.get(`/api/identity-providers/${id}/role-mappings`, {
      headers: this.authHeaders(token),
    })
    return data.data ?? []
  }

  async createRoleMapping(
    token: string,
    id: string,
    body: Record<string, unknown>,
  ): Promise<RoleMappingRecord> {
    const { data } = await this.client.post(`/api/identity-providers/${id}/role-mappings`, body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async deleteRoleMapping(token: string, id: string, ruleId: number): Promise<void> {
    await this.client.delete(`/api/identity-providers/${id}/role-mappings/${ruleId}`, {
      headers: this.authHeaders(token),
    })
  }

  async listScopeRules(token: string, id: string): Promise<ScopeRuleRecord[]> {
    const { data } = await this.client.get(`/api/identity-providers/${id}/scope-rules`, {
      headers: this.authHeaders(token),
    })
    return data.data ?? []
  }

  async createScopeRule(
    token: string,
    id: string,
    body: Record<string, unknown>,
  ): Promise<ScopeRuleRecord> {
    const { data } = await this.client.post(`/api/identity-providers/${id}/scope-rules`, body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async deleteScopeRule(token: string, id: string, ruleId: number): Promise<void> {
    await this.client.delete(`/api/identity-providers/${id}/scope-rules/${ruleId}`, {
      headers: this.authHeaders(token),
    })
  }

  async updateProviderDefaultScope(
    token: string,
    id: string,
    body: { mode: 'all' | 'restricted'; tenantIds?: string[] },
  ): Promise<IdentityProviderRecord> {
    const { data } = await this.client.patch(`/api/identity-providers/${id}/default-scope`, body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async listScimTokens(token: string, id: string): Promise<ScimTokenRecord[]> {
    const { data } = await this.client.get(`/api/identity-providers/${id}/scim-tokens`, {
      headers: this.authHeaders(token),
    })
    return data.data ?? []
  }

  async mintScimToken(
    token: string,
    id: string,
    label?: string,
  ): Promise<ScimTokenRecord & { plaintext: string }> {
    const { data } = await this.client.post(
      `/api/identity-providers/${id}/scim-tokens`,
      { label },
      { headers: this.authHeaders(token) },
    )
    return data.data
  }

  /** Throws on refusal — see deleteIdentityProvider. A SCIM token the operator
   *  believes is revoked and is not is a live credential. */
  async revokeScimToken(token: string, id: string, tokenId: string): Promise<void> {
    await this.client.delete(`/api/identity-providers/${id}/scim-tokens/${tokenId}`, {
      headers: this.authHeaders(token),
    })
  }

  async hasUsers(): Promise<boolean> {
    // Read-only first-run check — must never have side effects (a probe that
    // POSTs to /setup would persist a known-credentials admin).
    const { data } = await this.client.get('/api/auth/has-users')
    return data?.hasUsers === true
  }

  // ── Verticals ───────────────────────────────────────────

  async getVerticals(token: string): Promise<VerticalStatus[]> {
    const { data } = await this.client.get('/api/verticals', { headers: this.authHeaders(token) })
    return data.data
  }

  // ── Connections ─────────────────────────────────────────

  async listConnections(
    token: string,
    filters?: { vertical?: string; status?: string; platform?: string },
  ): Promise<TaggedConnection[]> {
    const { data } = await this.client.get('/api/connections', {
      headers: this.authHeaders(token),
      params: filters,
    })
    return data.data
  }

  /**
   * Paginated variant for the /connections list page — returns the page
   * slice plus meta.
   *
   * `sort`/`dir`/`f_*` are forwarded verbatim to `GET /api/connections` —
   * see apps/admin-api's connections route (`CONNECTION_SORT_ACCESSORS`,
   * `ListQuery`), which
   * is the wire contract's only authority. This route's own table is built
   * to FORWARD rather than apply: admin-api paginates connections at
   * 50/page, so sorting or filtering only the page already in hand would
   * silently narrow or reorder that one page while the pagination control
   * kept claiming to speak for the whole set. `vertical`/`status`/
   * `platform` (the plain, non-`f_` params) are no longer sent by this
   * app's own route — /connections' filter row submits `f_vertical`,
   * `f_status`, `f_platform` and `f_label` instead — but stay accepted here
   * since admin-api still answers them for a direct API caller. `search` IS
   * still sent, though: it is admin-api's own top-level `search` param
   * (admin-api never declares an `f_search`), matching connection id OR
   * label, which is what /connections' hidden search column forwards here —
   * see `FILTER_PARAM.search` in routes/connections.ts. No single per-column
   * filter can express that id-or-label OR match, so `search` stays a plain
   * param rather than folding into the `f_*` family.
   */
  async listConnectionsPaged(
    token: string,
    filters?: {
      vertical?: string
      status?: string
      platform?: string
      search?: string
      page?: number
      limit?: number
      sort?: string
      dir?: string
      f_label?: string
      f_id?: string
      f_vertical?: string
      f_status?: string
      f_platform?: string
      f_tenant?: string
    },
  ): Promise<{ data: TaggedConnection[]; meta: PageMeta }> {
    const { data } = await this.client.get('/api/connections', {
      headers: this.authHeaders(token),
      params: filters,
    })
    return { data: data.data, meta: data.meta }
  }

  async getConnection(
    token: string,
    vertical: string,
    id: string,
  ): Promise<TaggedConnection | null> {
    try {
      const { data } = await this.client.get(`/api/connections/${vertical}/${id}`, {
        headers: this.authHeaders(token),
      })
      return data.data
    } catch (err) {
      return AdminApiClient.nullOn404(err)
    }
  }

  /**
   * Rename a connection. `null` clears the label.
   *
   * Deliberately not wrapped in `nullOn404`: every failure here is something
   * the operator has to be told about — a taken label answers 409, and
   * swallowing it would leave the old name on screen with no explanation.
   */
  async updateConnectionLabel(
    token: string,
    vertical: string,
    id: string,
    label: string | null,
  ): Promise<TaggedConnection> {
    const { data } = await this.client.patch(
      `/api/connections/${vertical}/${id}`,
      { label },
      { headers: this.authHeaders(token) },
    )
    return data.data
  }

  /**
   * Set a connection's sync schedule. Not folded on 404, like the rename:
   * every refusal is something the operator has to be told.
   */
  async setConnectionSyncSchedule(
    token: string,
    vertical: string,
    id: string,
    schedule: SyncSchedule,
  ): Promise<TaggedConnection> {
    const { data } = await this.client.put(
      `/api/connections/${vertical}/${id}/sync-schedule`,
      schedule,
      { headers: this.authHeaders(token) },
    )
    return data.data
  }

  async deleteConnection(token: string, vertical: string, id: string): Promise<void> {
    await this.client.delete(`/api/connections/${vertical}/${id}`, {
      headers: this.authHeaders(token),
    })
  }

  // ── Platform catalog (metadata browse) ─────────────────
  // Distinct from listPlatforms() below, which is the operator-config
  // surface. Catalog returns marketing metadata (logos, auth_type) for
  // every known platform; listPlatforms returns enabled / hasConfig
  // rows for one vertical.

  async listCatalog(
    token: string,
    filters?: { vertical?: string; search?: string },
  ): Promise<TaggedPlatform[]> {
    const { data } = await this.client.get('/api/platforms', {
      headers: this.authHeaders(token),
      params: filters,
    })
    return data.data
  }

  // ── Notifications ───────────────────────────────────────

  async listNotifications(token: string): Promise<NotificationRow[]> {
    const { data } = await this.client.get('/api/notifications', {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async acknowledgeNotification(token: string, id: number): Promise<void> {
    await this.client.post(
      `/api/notifications/${id}/acknowledge`,
      {},
      { headers: this.authHeaders(token) },
    )
  }

  async acknowledgeAll(token: string): Promise<void> {
    await this.client.post(
      '/api/notifications/acknowledge-all',
      {},
      { headers: this.authHeaders(token) },
    )
  }

  /**
   * What the header bell shows: unacknowledged notifications, minus
   * `credential_expiring` (admin-api excludes it — it auto-heals within a
   * poll, and counting it would keep the badge from ever reading zero).
   */
  async getUnreadNotificationCount(token: string): Promise<number> {
    const { data } = await this.client.get('/api/notifications/unread-count', {
      headers: this.authHeaders(token),
    })
    return data.data.count
  }

  // ── Dashboard tasks ─────────────────────────────────────
  // Clears on the dashboard's "Needs attention" panel. Deployment-wide and
  // clear-once: a row is hidden while a clear with the same key AND
  // fingerprint exists; the fingerprint moves when the condition recurs.
  // See admin-api's routes/dashboard-tasks.ts, and routes/dashboard-tasks.ts
  // here for how the keys and fingerprints are derived.

  async listDashboardDismissals(token: string): Promise<DashboardDismissalRecord[]> {
    const { data } = await this.client.get('/api/dashboard-tasks/dismissals', {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  /**
   * Clear 1..50 tasks. Throws on refusal — admin-api answers 403 for a
   * `platform:creds:*` key from an operator, with nothing stored — so the
   * route can say so rather than flash "Cleared" over a batch that was not.
   */
  async dismissDashboardTasks(
    token: string,
    items: ReadonlyArray<{ key: string; fingerprint: string }>,
  ): Promise<void> {
    await this.client.post(
      '/api/dashboard-tasks/dismissals',
      { items },
      { headers: this.authHeaders(token) },
    )
  }

  /** Undo one clear. Keys contain `:` and may contain `/`, hence the encoding. */
  async undismissDashboardTask(token: string, key: string): Promise<void> {
    await this.client.delete(`/api/dashboard-tasks/dismissals/${encodeURIComponent(key)}`, {
      headers: this.authHeaders(token),
    })
  }

  // ── End-user tokens (per-customer MCP tokens) ──────────

  async listEndUserTokens(token: string, endUserId: string): Promise<EndUserTokenRow[]> {
    const { data } = await this.client.get('/api/end-user-tokens', {
      headers: this.authHeaders(token),
      params: { endUserId },
    })
    return data.data
  }

  async mintEndUserToken(
    token: string,
    body: { endUserId: string; tenantId: string; label?: string | null; scopes?: string[] },
  ): Promise<EndUserTokenMintResult> {
    const { data } = await this.client.post('/api/end-user-tokens', body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  /** Throws on refusal — see deleteIdentityProvider. */
  async revokeEndUserToken(token: string, id: string): Promise<void> {
    await this.client.delete(`/api/end-user-tokens/${id}`, { headers: this.authHeaders(token) })
  }

  // ── Users ───────────────────────────────────────────────

  /**
   * One console account. `opts.includeIdentity` reveals each link's external
   * id and writes a `user.pii_reveal` audit entry server-side — so pass it
   * only when the operator actually asked to see it.
   */
  async getUser(
    token: string,
    id: string,
    opts?: { includeIdentity?: boolean },
  ): Promise<UserDetail | null> {
    try {
      const { data } = await this.client.get(`/api/users/${encodeURIComponent(id)}`, {
        headers: this.authHeaders(token),
        params: opts?.includeIdentity ? { include_identity: 'true' } : undefined,
      })
      return data.data
    } catch (err) {
      return AdminApiClient.nullOn404(err)
    }
  }

  // ── Runtime settings ────────────────────────────────────

  async listRuntimeSettings(token: string): Promise<RuntimeSettingRow[]> {
    const { data } = await this.client.get('/api/runtime-settings', {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async updateRuntimeSetting(
    token: string,
    key: string,
    value: unknown,
  ): Promise<RuntimeSettingRow> {
    const { data } = await this.client.patch(
      `/api/runtime-settings/${encodeURIComponent(key)}`,
      // `key` is required in the body, not just the path: the PATCH body schema
      // is a discriminated union on it, which is what types `value` per
      // setting. The handler additionally cross-checks the two against each
      // other.
      { key, value },
      { headers: this.authHeaders(token) },
    )
    return data.data
  }

  async resetRuntimeSetting(token: string, key: string): Promise<RuntimeSettingRow> {
    const { data } = await this.client.delete(`/api/runtime-settings/${encodeURIComponent(key)}`, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  // ── Platform logos ──────────────────────────────────────

  async getLogoStatus(token: string): Promise<LogoStatus> {
    const { data } = await this.client.get('/api/logos/status', {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async listLogoFetchJobs(token: string): Promise<LogoFetchJob[]> {
    const { data } = await this.client.get('/api/logo-fetch', {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  /** Most recent job, running or not — what the tab renders on first paint. */
  async getActiveLogoFetch(token: string): Promise<LogoFetchJob | null> {
    const jobs = await this.listLogoFetchJobs(token)
    return jobs[0] ?? null
  }

  async startLogoFetch(
    token: string,
    body: { force?: boolean; vertical?: string; slug?: string },
  ): Promise<LogoFetchJob> {
    const { data } = await this.client.post('/api/logo-fetch', body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async cancelLogoFetch(token: string, id: string): Promise<LogoFetchJob> {
    const { data } = await this.client.post(
      `/api/logo-fetch/${encodeURIComponent(id)}/cancel`,
      {},
      { headers: this.authHeaders(token) },
    )
    return data.data
  }

  async purgeLogos(token: string): Promise<{ deleted: number }> {
    const { data } = await this.client.delete('/api/logos', {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  // ── Schema status ───────────────────────────────────────

  async getSchemaStatus(token: string): Promise<{ data: SchemaStatusEntry[] }> {
    const { data } = await this.client.get('/api/schema-status', {
      headers: this.authHeaders(token),
    })
    return data
  }

  // ── License ─────────────────────────────────────────────

  /** The license status (admin role). null when admin-api predates the route (404); throws otherwise. */
  async getLicense(token: string): Promise<LicenseStatusRecord | null> {
    try {
      const { data } = await this.client.get('/api/license', { headers: this.authHeaders(token) })
      return data.data as LicenseStatusRecord
    } catch (err) {
      return AdminApiClient.nullOn404(err)
    }
  }

  // ── Audit ───────────────────────────────────────────────

  /** The typed action vocabulary, for the filter datalist. */
  async listAuditActions(token: string): Promise<string[]> {
    const { data } = await this.client.get('/api/audit/actions', {
      headers: this.authHeaders(token),
    })
    return data.data ?? []
  }

  /**
   * One page of the audit log.
   *
   * `sort`/`dir` are forwarded, not applied here: `/api/audit` paginates in
   * SQL, so ordering has to happen upstream of the slice or it would only
   * reorder the fifty rows already fetched. Both are optional and additive —
   * an unrecognised `sort` is ignored server-side and the default
   * newest-first order stands.
   */
  async listAudit(
    token: string,
    page?: number,
    limit?: number,
    filters?: AuditFilter,
    sort?: string,
    dir?: string,
  ): Promise<{ data: AuditEntry[]; meta: { page: number; limit: number; total: number } }> {
    const { data } = await this.client.get('/api/audit', {
      headers: this.authHeaders(token),
      params: { page, limit, sort, dir, ...filters },
    })
    return data
  }

  /** Fetch the audit-log export (CSV or JSON) as raw text for the admin UI to
   *  re-serve as a download. Filters mirror the list endpoint. */
  async exportAudit(
    token: string,
    format: 'csv' | 'json',
    filters?: AuditFilter,
  ): Promise<{ body: string; contentType: string }> {
    const res = await this.client.get('/api/audit/export', {
      headers: this.authHeaders(token),
      params: { format, ...filters },
      responseType: 'text',
    })
    const contentType =
      (res.headers['content-type'] as string | undefined) ??
      (format === 'json' ? 'application/json' : 'text/csv')
    return { body: typeof res.data === 'string' ? res.data : String(res.data), contentType }
  }

  // ── Users ───────────────────────────────────────────────

  async listUsers(token: string): Promise<ApiUser[]> {
    const { data } = await this.client.get('/api/users', { headers: this.authHeaders(token) })
    return data.data
  }

  async createUser(
    token: string,
    username: string,
    password: string,
    role: string,
    email?: string,
  ): Promise<ApiUser> {
    const { data } = await this.client.post(
      '/api/users',
      { username, password, role, ...(email ? { email } : {}) },
      { headers: this.authHeaders(token) },
    )
    return data.data
  }

  /** `email: null` clears it; the address is owned by the console after. */
  async updateUser(
    token: string,
    id: string,
    body: { role?: string; password?: string; email?: string | null },
  ): Promise<ApiUser> {
    const { data } = await this.client.patch(`/api/users/${id}`, body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  /**
   * A user's profile picture, for the same-origin proxy route. Null when the
   * user has none (admin-api 404s); 304 passes through so the browser's
   * cached copy is reused.
   */
  async getUserAvatar(token: string, id: string, ifNoneMatch?: string): Promise<UserAvatarResponse | null> {
    try {
      const res = await this.client.get(`/api/users/${encodeURIComponent(id)}/avatar`, {
        headers: { ...this.authHeaders(token), ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}) },
        responseType: 'arraybuffer',
        validateStatus: (s) => s === 200 || s === 304,
      })
      const header = (name: string) => {
        const v = res.headers?.[name]
        return typeof v === 'string' ? v : null
      }
      return {
        status: res.status === 304 ? 304 : 200,
        bytes: Buffer.from(res.data ?? []),
        contentType: header('content-type'),
        etag: header('etag'),
      }
    } catch (err) {
      return AdminApiClient.nullOn404(err)
    }
  }

  /** Upload a picture as base64. admin-api decides the type from the bytes
   *  and enforces who may change whose; its refusal is thrown. */
  async setUserAvatar(token: string, id: string, base64: string): Promise<void> {
    await this.client.put(
      `/api/users/${encodeURIComponent(id)}/avatar`,
      { data: base64 },
      { headers: this.authHeaders(token) },
    )
  }

  async deleteUserAvatar(token: string, id: string): Promise<void> {
    await this.client.delete(`/api/users/${encodeURIComponent(id)}/avatar`, {
      headers: this.authHeaders(token),
    })
  }

  /** Throws on refusal — see deleteIdentityProvider. admin-api 400s an attempt
   *  to delete your own account; the refusal must reach the operator. */
  async deleteUser(token: string, id: string): Promise<void> {
    await this.client.delete(`/api/users/${id}`, { headers: this.authHeaders(token) })
  }

  // ── Adapter management ──────────────────────────────────

  /**
   * Operator rows for every vertical in one request. Prefer this over looping
   * `listPlatforms` per vertical: that pattern costs ten upstream calls per
   * Connect Link render and can exhaust integration-server's per-IP rate
   * budget.
   */
  async listAllPlatformRows(
    token: string,
  ): Promise<Array<{ vertical?: string; slug: string; enabled: boolean; hasConfig: boolean }>> {
    const { data } = await this.client.get('/api/platforms/status', {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async listPlatforms(
    token: string,
    vertical: string,
  ): Promise<Array<{ slug: string; enabled: boolean; hasConfig: boolean; unsupported?: UnsupportedPlatformInfo }>> {
    const { data } = await this.client.get(`/api/verticals/${vertical}/platforms`, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async enablePlatform(
    token: string,
    vertical: string,
    slug: string,
    config?: Record<string, unknown>,
  ): Promise<void> {
    await this.client.post(
      `/api/verticals/${vertical}/platforms/${slug}/enable`,
      { config },
      { headers: this.authHeaders(token) },
    )
  }

  async disablePlatform(token: string, vertical: string, slug: string): Promise<void> {
    await this.client.post(
      `/api/verticals/${vertical}/platforms/${slug}/disable`,
      {},
      { headers: this.authHeaders(token) },
    )
  }

  async setPlatformConfig(
    token: string,
    vertical: string,
    slug: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    await this.client.put(
      `/api/verticals/${vertical}/platforms/${slug}/config`,
      { config },
      { headers: this.authHeaders(token) },
    )
  }

  async getPlatformConfig(
    token: string,
    vertical: string,
    slug: string,
  ): Promise<PlatformConfigRedactedRecord | null> {
    try {
      const { data } = await this.client.get(
        `/api/verticals/${vertical}/platforms/${slug}/config`,
        { headers: this.authHeaders(token) },
      )
      return data.data ?? null
    } catch (err: any) {
      if (err?.response?.status === 404) return null
      throw err
    }
  }

  // ── Scope groups ────────────────────────────────────────

  async listScopeGroups(
    token: string,
    filter?: { vertical?: string; platform?: string },
  ): Promise<ScopeGroupRecord[]> {
    const { data } = await this.client.get('/api/scope-groups', {
      headers: this.authHeaders(token),
      params: filter,
    })
    return data.data ?? []
  }

  async createScopeGroup(
    token: string,
    body: { vertical: string; platform: string; name: string; scopes: string[] },
  ): Promise<ScopeGroupRecord> {
    const { data } = await this.client.post('/api/scope-groups', body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async updateScopeGroup(
    token: string,
    id: number,
    patch: { name?: string; scopes?: string[] },
  ): Promise<ScopeGroupRecord> {
    const { data } = await this.client.put(`/api/scope-groups/${id}`, patch, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async deleteScopeGroup(token: string, id: number): Promise<void> {
    await this.client.delete(`/api/scope-groups/${id}`, {
      headers: this.authHeaders(token),
    })
  }

  // ── Tenants & custom domains ────────────────────────────────────────────

  async listTenants(token: string): Promise<TenantRecord[]> {
    const { data } = await this.client.get('/api/tenants', { headers: this.authHeaders(token) })
    return data.data ?? []
  }

  async createTenant(token: string, body: { id?: string; name: string }): Promise<TenantRecord> {
    const { data } = await this.client.post('/api/tenants', body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async updateTenant(token: string, id: string, name: string): Promise<TenantRecord> {
    const { data } = await this.client.put(
      `/api/tenants/${encodeURIComponent(id)}`,
      { name },
      {
        headers: this.authHeaders(token),
      },
    )
    return data.data
  }

  async deleteTenant(token: string, id: string): Promise<void> {
    await this.client.delete(`/api/tenants/${encodeURIComponent(id)}`, {
      headers: this.authHeaders(token),
    })
  }

  async listTenantDomains(token: string): Promise<TenantDomainRecord[]> {
    const { data } = await this.client.get('/api/tenant-domains', {
      headers: this.authHeaders(token),
    })
    return data.data ?? []
  }

  async addTenantDomain(
    token: string,
    domain: string,
    tenantId: string,
  ): Promise<TenantDomainRecord> {
    const { data } = await this.client.post(
      '/api/tenant-domains',
      { domain, tenantId },
      {
        headers: this.authHeaders(token),
      },
    )
    return data.data
  }

  async removeTenantDomain(token: string, domain: string): Promise<void> {
    await this.client.delete(`/api/tenant-domains/${encodeURIComponent(domain)}`, {
      headers: this.authHeaders(token),
    })
  }

  // ── Connect link templates ────────────────────────────────

  async listConnectLinkTemplates(
    token: string,
    filter?: { tenantId?: string },
  ): Promise<ConnectLinkTemplateRecord[]> {
    const { data } = await this.client.get('/api/connect-link-templates', {
      headers: this.authHeaders(token),
      params: filter,
    })
    return data.data ?? []
  }

  async getConnectLinkTemplate(
    token: string,
    id: number,
  ): Promise<ConnectLinkTemplateRecord | null> {
    try {
      const { data } = await this.client.get(`/api/connect-link-templates/${id}`, {
        headers: this.authHeaders(token),
      })
      return data.data ?? null
    } catch (err) {
      return AdminApiClient.nullOn404(err)
    }
  }

  async createConnectLinkTemplate(
    token: string,
    body: ConnectLinkTemplateInput,
  ): Promise<ConnectLinkTemplateRecord> {
    const { data } = await this.client.post('/api/connect-link-templates', body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async updateConnectLinkTemplate(
    token: string,
    id: number,
    patch: Partial<ConnectLinkTemplateInput>,
  ): Promise<ConnectLinkTemplateRecord> {
    const { data } = await this.client.put(`/api/connect-link-templates/${id}`, patch, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async deleteConnectLinkTemplate(token: string, id: number): Promise<void> {
    await this.client.delete(`/api/connect-link-templates/${id}`, {
      headers: this.authHeaders(token),
    })
  }

  // ── Company info ────────────────────────────────────────

  async getCompanyInfo(token: string): Promise<CompanyInfoRecord | null> {
    const { data } = await this.client.get('/api/company-info', {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async setCompanyInfo(token: string, patch: Partial<CompanyInfo>): Promise<CompanyInfoRecord> {
    const { data } = await this.client.put('/api/company-info', patch, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  /** Delete the record, back to the defaults OpenSteward ships with. */
  async resetCompanyInfo(token: string): Promise<void> {
    await this.client.delete('/api/company-info', {
      headers: this.authHeaders(token),
    })
  }

  // ── End-users (Connect Link customers) ────────────────────

  async listEndUsers(
    token: string,
    filters?: { tenantId?: string; q?: string; limit?: number; offset?: number },
  ): Promise<EndUserSummary[]> {
    const { data } = await this.client.get('/api/end-users', {
      headers: this.authHeaders(token),
      params: filters,
    })
    return data.data ?? []
  }

  /**
   * Paginated variant for the /customers list page — returns the page slice
   * plus meta.
   *
   * `sort`/`dir`/`email`/`displayName`/`externalReference`/`tenantId`/`q` are
   * forwarded verbatim to `GET /api/end-users` — see admin-api's own
   * `routes/end-users.ts` (`ListQuery`), which is the wire contract's only
   * authority. This route's own table (routes/customers.ts) is built to
   * FORWARD rather than apply: the store paginates end-users at the SQL
   * layer, so sorting or filtering only the page already in hand here would
   * silently narrow or reorder that one page while the pagination control
   * kept claiming to speak for the whole set.
   */
  async listEndUsersPaged(
    token: string,
    filters?: {
      tenantId?: string
      q?: string
      email?: string
      displayName?: string
      externalReference?: string
      page?: number
      limit?: number
      sort?: string
      dir?: string
    },
  ): Promise<{ data: EndUserSummary[]; meta: PageMeta }> {
    const { data } = await this.client.get('/api/end-users', {
      headers: this.authHeaders(token),
      params: filters,
    })
    return { data: data.data ?? [], meta: data.meta }
  }

  async getEndUser(
    token: string,
    id: string,
    opts?: { includePii?: boolean },
  ): Promise<EndUserDetail | null> {
    try {
      const { data } = await this.client.get(`/api/end-users/${id}`, {
        headers: this.authHeaders(token),
        params: opts?.includePii ? { include_pii: 'true' } : undefined,
      })
      return data.data
    } catch (err) {
      return AdminApiClient.nullOn404(err)
    }
  }

  async createEndUser(token: string, body: Record<string, unknown>): Promise<EndUserSummary> {
    const { data } = await this.client.post('/api/end-users', body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async updateEndUser(
    token: string,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<EndUserSummary> {
    const { data } = await this.client.patch(`/api/end-users/${id}`, patch, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async deleteEndUser(token: string, id: string): Promise<void> {
    await this.client.delete(`/api/end-users/${id}`, { headers: this.authHeaders(token) })
  }

  // ── Connect-link sessions ──────────────────────────────────

  async listConnectSessions(
    token: string,
    filters?: { tenantId?: string; endUserId?: string; status?: string },
  ): Promise<ConnectSessionRecord[]> {
    const { data } = await this.client.get('/api/connect-sessions', {
      headers: this.authHeaders(token),
      params: filters,
    })
    return data.data ?? []
  }

  async getConnectSession(token: string, id: string): Promise<ConnectSessionDetail | null> {
    try {
      const { data } = await this.client.get(`/api/connect-sessions/${id}`, {
        headers: this.authHeaders(token),
      })
      return data.data
    } catch (err) {
      return AdminApiClient.nullOn404(err)
    }
  }

  async createConnectSession(
    token: string,
    body: Record<string, unknown>,
  ): Promise<ConnectSessionRecord & { url?: string }> {
    const { data } = await this.client.post('/api/connect-sessions', body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async revokeConnectSession(token: string, id: string): Promise<void> {
    await this.client.delete(`/api/connect-sessions/${id}`, { headers: this.authHeaders(token) })
  }

  // ── Developer API keys ──────────────────────────────────────

  async listApiKeys(token: string, tenantId?: string): Promise<ApiKeyRecord[]> {
    const { data } = await this.client.get('/api/api-keys', {
      headers: this.authHeaders(token),
      params: tenantId ? { tenantId } : undefined,
    })
    return data.data ?? []
  }

  /**
   * One key by id, for the detail page.
   *
   * There is no `GET /api/api-keys/:id` to call: admin-api exposes list, mint
   * and revoke only, and the underlying store is queried by tenant. So this
   * lists and filters. It stays in the client rather than the route because
   * the day that endpoint exists, this is the one place that has to change.
   */
  /**
   * One API key by id, or null when no key has that id.
   *
   * Deliberately does NOT catch: an upstream failure is not the same fact as
   * "no such key", and collapsing the two tells an operator their key was
   * deleted when admin-api is merely unreachable.
   *
   * There is no GET /api/api-keys/:id upstream, so this filters the list.
   */
  async getApiKey(token: string, id: string): Promise<ApiKeyRecord | null> {
    const keys = await this.listApiKeys(token)
    return keys.find((k) => k.id === id) ?? null
  }

  async mintApiKey(
    token: string,
    body: {
      tenantId: string
      label?: string | null
      scopes?: string[]
      mode?: 'live' | 'test'
      expiresAt?: number | null
    },
  ): Promise<ApiKeyMint> {
    const { data } = await this.client.post('/api/api-keys', body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async rotateApiKey(token: string, id: string): Promise<ApiKeyRotate> {
    const { data } = await this.client.post(
      `/api/api-keys/${id}/rotate`,
      {},
      { headers: this.authHeaders(token) },
    )
    return data.data
  }

  async revokeApiKey(token: string, id: string): Promise<void> {
    await this.client.delete(`/api/api-keys/${id}`, { headers: this.authHeaders(token) })
  }

  // ── OIDC bearer-token configuration ─────────────────────────
  //
  // Issuers and their registered clients live in the integration-server, next
  // to the verifier that reads them on every request; admin-api proxies them.
  // Nothing here carries a secret — a resource server verifies with the
  // issuer's published public keys.

  async listOAuthIssuers(token: string): Promise<OAuthIssuerRecord[]> {
    const { data } = await this.client.get('/api/oauth/issuers', {
      headers: this.authHeaders(token),
    })
    return data.data ?? []
  }

  async getOAuthIssuer(token: string, id: string): Promise<OAuthIssuerDetailRecord | null> {
    const { data } = await this.client.get(`/api/oauth/issuers/${encodeURIComponent(id)}`, {
      headers: this.authHeaders(token),
    })
    return data.data ?? null
  }

  async getOAuthReadiness(token: string): Promise<{ ready: boolean; reason: string }> {
    const { data } = await this.client.get('/api/oauth/readiness', {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async listOAuthPresets(token: string): Promise<OAuthPresetRecord[]> {
    const { data } = await this.client.get('/api/oauth/presets', {
      headers: this.authHeaders(token),
    })
    return data.data ?? []
  }

  async discoverOAuthIssuer(
    token: string,
    issuer: string,
  ): Promise<{ issuer: string; jwksUri: string }> {
    const { data } = await this.client.post(
      '/api/oauth/discover',
      { issuer },
      { headers: this.authHeaders(token) },
    )
    return data.data
  }

  async createOAuthIssuer(
    token: string,
    body: Record<string, unknown>,
  ): Promise<OAuthIssuerRecord> {
    const { data } = await this.client.post('/api/oauth/issuers', body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async updateOAuthIssuer(
    token: string,
    id: string,
    body: Record<string, unknown>,
  ): Promise<OAuthIssuerRecord> {
    const { data } = await this.client.patch(`/api/oauth/issuers/${encodeURIComponent(id)}`, body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async deleteOAuthIssuer(token: string, id: string): Promise<void> {
    await this.client.delete(`/api/oauth/issuers/${encodeURIComponent(id)}`, {
      headers: this.authHeaders(token),
    })
  }

  async createOAuthClient(
    token: string,
    issuerId: string,
    body: Record<string, unknown>,
  ): Promise<OAuthClientRecord> {
    const { data } = await this.client.post(
      `/api/oauth/issuers/${encodeURIComponent(issuerId)}/clients`,
      body,
      { headers: this.authHeaders(token) },
    )
    return data.data
  }

  async revokeOAuthClient(token: string, id: string, subject?: string): Promise<void> {
    await this.client.delete(`/api/oauth/clients/${encodeURIComponent(id)}`, {
      headers: this.authHeaders(token),
      params: subject ? { subject } : undefined,
    })
  }

  async createOAuthScopeRule(
    token: string,
    issuerId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    await this.client.post(`/api/oauth/issuers/${encodeURIComponent(issuerId)}/rules`, body, {
      headers: this.authHeaders(token),
    })
  }

  async deleteOAuthScopeRule(token: string, id: string): Promise<void> {
    await this.client.delete(`/api/oauth/rules/${encodeURIComponent(id)}`, {
      headers: this.authHeaders(token),
    })
  }

  // ── Outbound webhook subscriptions ──────────────────────────

  /**
   * `filters` is an object rather than a positional `tenantId` because there
   * are two of them and a second bare string argument at a call site says
   * nothing about which filter it is.
   */
  async listWebhookSubs(
    token: string,
    filters?: { tenantId?: string; search?: string },
  ): Promise<WebhookSubRecord[]> {
    const params: Record<string, string> = {}
    if (filters?.tenantId) params.tenantId = filters.tenantId
    if (filters?.search) params.search = filters.search
    const { data } = await this.client.get('/api/webhook-subscriptions', {
      headers: this.authHeaders(token),
      params: Object.keys(params).length > 0 ? params : undefined,
    })
    return data.data ?? []
  }

  async createWebhookSub(
    token: string,
    body: {
      tenantId: string
      url: string
      label?: string | null
      events?: string[]
      format?: WebhookFormat
      headers?: Record<string, string>
    },
  ): Promise<WebhookSubWithSecret> {
    const { data } = await this.client.post('/api/webhook-subscriptions', body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  /**
   * Changes delivery settings. Lets the upstream error propagate: a rejected
   * header carries the reason, and the operator who typed it needs to read it.
   */
  async updateWebhookSub(
    token: string,
    id: string,
    body: {
      format?: WebhookFormat
      headers?: Record<string, string> | null
      label?: string | null
    },
  ): Promise<WebhookSubRecord> {
    const { data } = await this.client.patch(`/api/webhook-subscriptions/${id}`, body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  /** Sends one synthetic event. Errors propagate — a diagnostic that silently
   *  reports nothing is worse than no diagnostic. */
  async testWebhookSub(token: string, id: string): Promise<WebhookTestResult> {
    const { data } = await this.client.post(`/api/webhook-subscriptions/${id}/test`, undefined, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async deleteWebhookSub(token: string, id: string): Promise<void> {
    await this.client.delete(`/api/webhook-subscriptions/${id}`, {
      headers: this.authHeaders(token),
    })
  }

  async pauseWebhookSub(token: string, id: string, paused: boolean): Promise<void> {
    await this.client.post(
      `/api/webhook-subscriptions/${id}/paused`,
      { paused },
      { headers: this.authHeaders(token) },
    )
  }

  async rotateWebhookSubSecret(token: string, id: string): Promise<string> {
    const { data } = await this.client.post(
      `/api/webhook-subscriptions/${id}/rotate-secret`,
      undefined,
      { headers: this.authHeaders(token) },
    )
    return data.data.secret
  }

  async listWebhookDeliveries(
    token: string,
    subscriptionId: string,
    opts?: { status?: 'pending' | 'delivered' | 'dead'; limit?: number },
  ): Promise<WebhookDeliveryRecord[]> {
    const { data } = await this.client.get(
      `/api/webhook-subscriptions/${subscriptionId}/deliveries`,
      { headers: this.authHeaders(token), params: opts },
    )
    return data.data ?? []
  }

  /**
   * Paginated variant for the deliveries list page — returns the page slice
   * plus meta.
   *
   * `sort`/`dir`/`eventType`/`eventId` are forwarded verbatim to
   * `GET /api/webhook-subscriptions/:id/deliveries` — see admin-api's own
   * `routes/webhook-subs.ts` (`DeliveriesQuery`), which is the wire
   * contract's only authority, and `WebhookDeliveryStore.listForSubscription`/
   * `countForSubscription` underneath it for what each actually matches/
   * orders on. This route's own table (routes/webhooks.ts) is built to
   * FORWARD rather than apply: the store paginates deliveries at the SQL
   * layer, so sorting or filtering only the page already in hand here would
   * silently narrow or reorder that one page while the pagination control
   * kept claiming to speak for the whole set.
   */
  async listWebhookDeliveriesPaged(
    token: string,
    subscriptionId: string,
    opts?: {
      // A plain string, not the narrower `'pending' | 'delivered' | 'dead'`
      // union `WebhookDeliveryRecord['status']` uses: routes/webhooks.ts
      // forwards `tableState.filters.status` here through the same generic
      // `FILTER_PARAM`-keyed spread /connections and /customers use for
      // their own enum columns, which is typed `Record<string, string>` —
      // narrowing this parameter would make that spread a compile error.
      // admin-api's own `DeliveriesQuery.status` is equally loose for the
      // same reason — see its doc comment — a hand-edited garbage value
      // degrades to "no status filter" rather than 400ing.
      status?: string
      eventType?: string
      eventId?: string
      sort?: string
      dir?: string
      page?: number
      limit?: number
    },
  ): Promise<{ data: WebhookDeliveryRecord[]; meta: PageMeta }> {
    const { data } = await this.client.get(
      `/api/webhook-subscriptions/${subscriptionId}/deliveries`,
      { headers: this.authHeaders(token), params: opts },
    )
    return { data: data.data ?? [], meta: data.meta }
  }

  async replayWebhookDelivery(
    token: string,
    subscriptionId: string,
    deliveryId: string,
  ): Promise<void> {
    await this.client.post(
      `/api/webhook-subscriptions/${subscriptionId}/deliveries/${deliveryId}/replay`,
      undefined,
      { headers: this.authHeaders(token) },
    )
  }

  // ── Data-store sync jobs ────────────────────────────────────

  async listSyncJobs(
    token: string,
    filters?: { vertical?: string; connection_id?: string; status?: string; limit?: number },
  ): Promise<SyncJobRecord[]> {
    const { data } = await this.client.get('/api/sync-jobs', {
      headers: this.authHeaders(token),
      params: filters,
    })
    return data.data ?? []
  }

  /**
   * Paginated variant for the /sync-jobs list page — returns the page slice
   * plus meta.
   *
   * `sort`, `dir` and the per-column filters are FORWARDED, never applied
   * here: admin-api pages this table at the store (`SyncStore.list`/`count`),
   * so sorting or filtering the one page already in hand would silently
   * reorder or narrow it while `meta.total` kept speaking for the whole set.
   * Key names are admin-api's own query params, which is what
   * `routes/sync-jobs.ts`'s `FILTER_PARAM` maps each column key onto —
   * deliberately NOT the `f_<key>` shape /connections uses, because admin-api
   * declares these under bare names and Fastify silently strips a param it
   * does not declare.
   */
  async listSyncJobsPaged(
    token: string,
    filters?: {
      vertical?: string
      connection_id?: string
      status?: string
      platform?: string
      tenant_id?: string
      id?: string
      connection_id_contains?: string
      sort?: string
      dir?: string
      page?: number
      limit?: number
    },
  ): Promise<{ data: SyncJobRecord[]; meta: PageMeta }> {
    const { data } = await this.client.get('/api/sync-jobs', {
      headers: this.authHeaders(token),
      params: filters,
    })
    return { data: data.data ?? [], meta: data.meta }
  }

  async getSyncJob(token: string, id: string): Promise<SyncJobRecord | null> {
    try {
      const { data } = await this.client.get(`/api/sync-jobs/${id}`, {
        headers: this.authHeaders(token),
      })
      return data.data
    } catch (err) {
      return AdminApiClient.nullOn404(err)
    }
  }

  /**
   * Throws on refusal rather than returning null, for the same reason
   * `createSyncJob` does: "already finished", "no such job" and "admin-api is
   * down" are three different things to tell an operator who just pressed
   * Cancel, and a null return would collapse all three.
   */
  async cancelSyncJob(token: string, id: string): Promise<SyncJobRecord> {
    const { data } = await this.client.post(`/api/sync-jobs/${id}/cancel`, undefined, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  /**
   * Enqueue a sync. Throws on refusal rather than returning null: the caller
   * needs to tell the operator whether a sync is already running (409), the
   * connection is unknown (404), or the deployment has no sync engine
   * (passthrough). `scrubUpstreamError` on the response interceptor keeps the
   * credentials out of whatever gets logged.
   */
  async createSyncJob(
    token: string,
    connectionId: string,
    callbackUrl?: string,
  ): Promise<SyncJobRecord> {
    const { data } = await this.client.post(
      '/api/sync-jobs',
      { connection_id: connectionId, ...(callbackUrl ? { callback_url: callbackUrl } : {}) },
      { headers: this.authHeaders(token) },
    )
    return data.data
  }

  async getDataStoreMetrics(token: string): Promise<DataStoreMetrics | null> {
    try {
      const { data } = await this.client.get('/api/data-store/metrics', {
        headers: this.authHeaders(token),
      })
      return (data.data as DataStoreMetrics) ?? null
    } catch {
      return null
    }
  }

  // ── Stored data (data viewer) ─────────────────────────────

  /** Connections in the caller's scope with what the data store holds for each. */
  async listDataConnections(token: string): Promise<DataConnectionSummary[]> {
    const { data } = await this.client.get('/api/data/summary', { headers: this.authHeaders(token) })
    return data.data ?? []
  }

  async getDataSchema(token: string, vertical: string, type: string): Promise<DataSchemaRecord | null> {
    try {
      const { data } = await this.client.get(
        `/api/data/schema/${encodeURIComponent(vertical)}/${encodeURIComponent(type)}`,
        { headers: this.authHeaders(token) },
      )
      return data.data ?? null
    } catch (err) {
      return AdminApiClient.nullOn404(err)
    }
  }

  /** One page of masked records. Throws on every refusal, 404 included. */
  async getDataRecordPage(token: string, connectionId: string, type: string, query: DataRecordQuery): Promise<DataRecordPage> {
    const { data } = await this.client.get(
      `/api/data/connections/${encodeURIComponent(connectionId)}/resources/${encodeURIComponent(type)}`,
      { headers: this.authHeaders(token), params: query },
    )
    return { data: data.data ?? [], meta: data.meta ?? {} }
  }

  async getDataRecord(token: string, connectionId: string, type: string, rid: string): Promise<DataRecordView | null> {
    try {
      const { data } = await this.client.get(
        `/api/data/connections/${encodeURIComponent(connectionId)}/resources/${encodeURIComponent(type)}/${encodeURIComponent(rid)}`,
        { headers: this.authHeaders(token) },
      )
      return { record: data.data, meta: data.meta ?? {} }
    } catch (err) {
      return AdminApiClient.nullOn404(err)
    }
  }

  /** Unmasked record — admin-api audits it as `data.pii_reveal`. */
  async revealDataRecord(token: string, connectionId: string, type: string, rid: string, reason: string | null): Promise<DataRecordView> {
    const { data } = await this.client.post(
      `/api/data/connections/${encodeURIComponent(connectionId)}/resources/${encodeURIComponent(type)}/${encodeURIComponent(rid)}/reveal`,
      reason ? { reason } : {},
      { headers: this.authHeaders(token) },
    )
    return { record: data.data, meta: data.meta ?? {} }
  }

  /**
   * Open an export stream from admin-api. The body is piped to the browser
   * untouched; an error status is read to the end and thrown with the
   * upstream body, so the error page can say why.
   */
  async openDataExport(token: string, connectionId: string, type: string, query: DataExportQuery): Promise<DataExportStream> {
    const res = await this.client.get(
      `/api/data/connections/${encodeURIComponent(connectionId)}/resources/${encodeURIComponent(type)}/export`,
      {
        headers: this.authHeaders(token),
        params: query,
        responseType: 'stream',
        timeout: 0,
        validateStatus: () => true,
      },
    )
    const stream = res.data as NodeJS.ReadableStream
    if (res.status >= 400) {
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
      let body: unknown = null
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        body = null
      }
      throw scrubUpstreamError(
        Object.assign(new Error(`Request failed with status code ${res.status}`), {
          response: { status: res.status, data: body, headers: {} },
        }),
      )
    }
    const headers: Record<string, string> = {}
    for (const key of ['content-type', 'content-disposition', 'x-opensteward-export-max-rows']) {
      const v = (res.headers as Record<string, unknown>)[key]
      if (typeof v === 'string') headers[key] = v
    }
    return { stream, headers }
  }

  // ── Dashboards ────────────────────────────────────────────

  async listDashboards(token: string): Promise<DashboardRecord[]> {
    const { data } = await this.client.get('/api/dashboards', { headers: this.authHeaders(token) })
    return data.data ?? []
  }

  async getDashboard(token: string, id: string): Promise<DashboardRecord | null> {
    try {
      const { data } = await this.client.get(`/api/dashboards/${encodeURIComponent(id)}`, {
        headers: this.authHeaders(token),
      })
      return data.data ?? null
    } catch (err) {
      return AdminApiClient.nullOn404(err)
    }
  }

  async createDashboard(token: string, body: DashboardInput): Promise<DashboardRecord> {
    const { data } = await this.client.post('/api/dashboards', body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async updateDashboard(token: string, id: string, body: Partial<DashboardInput>): Promise<DashboardRecord> {
    const { data } = await this.client.patch(`/api/dashboards/${encodeURIComponent(id)}`, body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async deleteDashboard(token: string, id: string): Promise<void> {
    await this.client.delete(`/api/dashboards/${encodeURIComponent(id)}`, {
      headers: this.authHeaders(token),
    })
  }

  async listDashboardMetrics(token: string): Promise<MetricInfoRecord[]> {
    const { data } = await this.client.get('/api/dashboards/metrics', {
      headers: this.authHeaders(token),
    })
    return data.data ?? []
  }

  /**
   * One metric's values. Throws on every refusal (the JSON route relays the
   * status). Only the parameters that are set are sent; `compare` goes as
   * `compare=1`.
   */
  async getDashboardMetric(token: string, id: string, query: MetricRangeQuery): Promise<unknown> {
    const params: Record<string, string> = {}
    if (query.from) params['from'] = query.from
    if (query.to) params['to'] = query.to
    if (query.dashboard) params['dashboard'] = query.dashboard
    if (query.currency) params['currency'] = query.currency
    if (query.granularity) params['granularity'] = query.granularity
    if (query.compare) params['compare'] = '1'
    if (query.connection) params['connection'] = query.connection
    if (query.platform) params['platform'] = query.platform
    if (query.vertical) params['vertical'] = query.vertical
    const { data } = await this.client.get(`/api/dashboards/metrics/${encodeURIComponent(id)}`, {
      headers: this.authHeaders(token),
      params,
    })
    return data.data
  }

  /**
   * Currencies to filter dashboards by (ISO 4217, sorted), in the caller's
   * scope — narrowed to a dashboard's pinned tenants when `dashboardId` is
   * given, and to one connection and / or adapter when `filter` names one.
   * Throws on a refusal; callers that only decorate a page catch.
   */
  async listDashboardCurrencies(
    token: string,
    dashboardId?: string,
    filter: DashboardConnectionFilter = {},
  ): Promise<string[]> {
    const params: Record<string, string> = {}
    if (dashboardId) params['dashboard'] = dashboardId
    if (filter.connection) params['connection'] = filter.connection
    if (filter.platform) params['platform'] = filter.platform
    if (filter.vertical) params['vertical'] = filter.vertical
    const { data } = await this.client.get('/api/dashboards/currencies', {
      headers: this.authHeaders(token),
      params: Object.keys(params).length > 0 ? params : undefined,
    })
    return Array.isArray(data?.data) ? (data.data as string[]) : []
  }

  /**
   * What a dashboard's connection filter can offer: the caller's in-scope
   * connections (narrowed to the dashboard's pins) and the adapters among
   * them. admin-api requires `dashboards:view` and `connections:read`.
   * Throws on a refusal; the page catches and says the list is unavailable.
   */
  async getDashboardConnections(
    token: string,
    query: DashboardConnectionsQuery,
  ): Promise<DashboardConnectionsRecord> {
    const params: Record<string, string> = {}
    if (query.dashboard) params['dashboard'] = query.dashboard
    if (query.vertical) params['vertical'] = query.vertical
    if (query.platform) params['platform'] = query.platform
    if (query.search) params['search'] = query.search
    if (query.limit) params['limit'] = String(query.limit)
    const { data } = await this.client.get('/api/dashboards/connections', {
      headers: this.authHeaders(token),
      params,
    })
    return data.data
  }

  // ── Embedded Superset ─────────────────────────────────────
  // See admin-api's routes/superset.ts. Off unless admin-api has SUPERSET_URL.

  /** Null when admin-api is unreachable or predates the feature. */
  async getSupersetStatus(token: string): Promise<SupersetStatusRecord | null> {
    try {
      const { data } = await this.client.get('/api/analytics/superset/status', { headers: this.authHeaders(token) })
      return (data.data as SupersetStatusRecord) ?? null
    } catch {
      return null
    }
  }

  async listSupersetDashboards(token: string): Promise<SupersetDashboardRecord[]> {
    const { data } = await this.client.get('/api/analytics/superset/dashboards', { headers: this.authHeaders(token) })
    return data.data ?? []
  }

  /** Throws on every refusal (the JSON route relays the status). */
  async createSupersetGuestToken(token: string, dashboardId: string): Promise<SupersetGuestTokenRecord> {
    const { data } = await this.client.post('/api/analytics/superset/guest-token', { dashboardId }, { headers: this.authHeaders(token) })
    return data.data
  }

  /** Who sees an embedded Superset dashboard (dashboards:share_all). Throws on every refusal. */
  async updateSupersetSharing(
    token: string,
    id: string,
    body: { audience: DashboardAudienceRecord; pinnedTenants: string[] | null },
  ): Promise<SupersetDashboardRecord> {
    const { data } = await this.client.patch(
      `/api/analytics/superset/dashboards/${encodeURIComponent(id)}`,
      body,
      { headers: this.authHeaders(token) },
    )
    return data.data
  }

  // ── Destinations ──────────────────────────────────────────
  // admin-api's routes/destinations.ts. Every refusal throws (a 409 in
  // passthrough mode, a 403 for a scope or PII refusal) so the page can show
  // the upstream code; only a single read answers null for a 404.

  async listDestinationTypes(token: string): Promise<DestinationTypeRecord[]> {
    const { data } = await this.client.get('/api/destinations/types', { headers: this.authHeaders(token) })
    return data.data ?? []
  }

  async listDestinations(token: string): Promise<DestinationRecord[]> {
    const { data } = await this.client.get('/api/destinations', { headers: this.authHeaders(token) })
    return data.data ?? []
  }

  async getDestination(token: string, id: string): Promise<DestinationRecord | null> {
    try {
      const { data } = await this.client.get(`/api/destinations/${encodeURIComponent(id)}`, {
        headers: this.authHeaders(token),
      })
      return data.data ?? null
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 404) return null
      throw err
    }
  }

  async createDestination(token: string, body: DestinationInput): Promise<DestinationRecord> {
    const { data } = await this.client.post('/api/destinations', body, { headers: this.authHeaders(token) })
    return data.data
  }

  async updateDestination(token: string, id: string, body: Partial<DestinationInput>): Promise<DestinationRecord> {
    const { data } = await this.client.patch(`/api/destinations/${encodeURIComponent(id)}`, body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async deleteDestination(token: string, id: string): Promise<void> {
    await this.client.delete(`/api/destinations/${encodeURIComponent(id)}`, { headers: this.authHeaders(token) })
  }

  async rotateDestinationCredentials(token: string, id: string, secrets: Record<string, unknown>): Promise<DestinationRecord> {
    const { data } = await this.client.put(
      `/api/destinations/${encodeURIComponent(id)}/credentials`,
      { secrets },
      { headers: this.authHeaders(token) },
    )
    return data.data
  }

  async testDestination(token: string, id: string): Promise<DestinationTestRecord> {
    const { data } = await this.client.post(
      `/api/destinations/${encodeURIComponent(id)}/test`,
      {},
      { headers: this.authHeaders(token), timeout: 70_000 },
    )
    return data.data
  }

  async runDestination(token: string, id: string): Promise<{ runId: string }> {
    const { data } = await this.client.post(
      `/api/destinations/${encodeURIComponent(id)}/run`,
      {},
      { headers: this.authHeaders(token) },
    )
    return data.data
  }

  async backfillDestination(token: string, id: string, body: DestinationBackfillInput): Promise<DestinationBackfillRecord> {
    const { data } = await this.client.post(`/api/destinations/${encodeURIComponent(id)}/backfill`, body, {
      headers: this.authHeaders(token),
    })
    return data.data
  }

  async listDestinationRuns(token: string, id: string): Promise<DestinationRunRecord[]> {
    const { data } = await this.client.get(`/api/destinations/${encodeURIComponent(id)}/runs`, {
      headers: this.authHeaders(token),
      params: { limit: '50' },
    })
    return data.data ?? []
  }

  // ── Read-only SQL access ──────────────────────────────────
  // admin-api's routes/sql-access.ts. The create / rotate answers carry a
  // one-time password: callers render it once and keep it nowhere.

  async getSqlAccessStatus(token: string): Promise<SqlAccessStatusRecord | null> {
    const { data } = await this.client.get('/api/sql-access/status', { headers: this.authHeaders(token) })
    return data.data ?? null
  }

  async provisionSqlAccess(token: string): Promise<SqlProvisionRecord> {
    const { data } = await this.client.post(
      '/api/sql-access/provision',
      {},
      { headers: this.authHeaders(token), timeout: 130_000 },
    )
    return data.data
  }

  async getSqlAccessProvisionScript(token: string): Promise<string | null> {
    const { data } = await this.client.get('/api/sql-access/provision-script', {
      headers: this.authHeaders(token),
      responseType: 'text',
      timeout: 70_000,
    })
    return typeof data === 'string' ? data : null
  }

  async getSqlAccessCatalog(token: string): Promise<SqlCatalogRecord | null> {
    const { data } = await this.client.get('/api/sql-access/catalog', { headers: this.authHeaders(token) })
    return data.data ?? null
  }

  async listSqlPrincipals(token: string): Promise<SqlPrincipalRecord[]> {
    const { data } = await this.client.get('/api/sql-access/principals', { headers: this.authHeaders(token) })
    return data.data ?? []
  }

  async createSqlPrincipal(token: string, body: SqlPrincipalInput): Promise<SqlPrincipalSecretRecord> {
    const { data } = await this.client.post('/api/sql-access/principals', body, {
      headers: this.authHeaders(token),
      timeout: 40_000,
    })
    return data.data
  }

  async rotateSqlPrincipal(token: string, id: string): Promise<SqlPrincipalSecretRecord> {
    const { data } = await this.client.post(
      `/api/sql-access/principals/${encodeURIComponent(id)}/rotate`,
      {},
      { headers: this.authHeaders(token), timeout: 40_000 },
    )
    return data.data
  }

  async revokeSqlPrincipal(token: string, id: string): Promise<SqlRevokeRecord> {
    const { data } = await this.client.delete(`/api/sql-access/principals/${encodeURIComponent(id)}`, {
      headers: this.authHeaders(token),
      timeout: 40_000,
    })
    return data.data
  }
}

// ── Stored data + dashboards ─────────────────────────────────────────────

export interface DataResourceSummary {
  resourceType: string
  count: number
  latestChangedAt: number | null
  collectionCompletedAt: number | null
  classified: boolean
}

export interface DataConnectionSummary {
  connectionId: string
  vertical: string
  platform: string
  label: string | null
  ownerTenantId: string | null
  resources: DataResourceSummary[]
}

export type FieldClassName = 'public' | 'internal' | 'pii' | 'financial' | 'secret'

export interface DataFieldRecord {
  path: string
  class: FieldClassName
  mask: string | null
  classified: boolean
  inSchema: boolean
  searchable: boolean
}

export interface DataSchemaRecord {
  vertical: string
  resourceType: string
  classified: boolean
  defaultClass: string
  fields: DataFieldRecord[]
}

export interface DataRecordRow {
  id: string
  resourceType: string
  vertical: string
  platform: string
  connectionId: string
  fetchedAt: string | null
  updatedAt: string | null
  changedAt: string | null
  normVersion: string | null
  data: Record<string, unknown>
}

export interface DataRecordMeta {
  piiRevealed?: boolean
  financialMasked?: boolean
  classified?: boolean
  nextCursor?: string | null
  total?: number
  totalCapped?: boolean
}

export interface DataRecordPage {
  data: DataRecordRow[]
  meta: DataRecordMeta
}

export interface DataRecordView {
  record: DataRecordRow
  meta: DataRecordMeta
}

export interface DataRecordQuery {
  cursor?: string
  limit?: string
  sort?: string
  dir?: string
  filters?: string
  q?: string
}

export interface DataExportQuery {
  format: 'csv' | 'ndjson'
  include_pii?: 'true'
  sort?: string
  dir?: string
  filters?: string
  q?: string
}

export interface DataExportStream {
  stream: NodeJS.ReadableStream
  headers: Record<string, string>
}

/** Every chart a widget can use (`CHART_TYPES` in `@opensteward/shared`). */
export type DashboardChart = ChartType

export interface DashboardWidgetRecord {
  metricId: string
  title?: string
  chart: DashboardChart
  width: number
  /** A pinned ISO 4217 currency; absent or null follows the view's filter. */
  currency?: string | null
  granularity?: GranularityParam
  compare?: boolean
}

export interface DashboardAudienceRecord {
  kind: 'private' | 'tenants' | 'everyone'
  tenants?: string[]
}

export interface DashboardRecord {
  id: string
  name: string
  description: string | null
  widgets: DashboardWidgetRecord[]
  builtin: boolean
  vertical: string | null
  ownerUserId: string | null
  audience: DashboardAudienceRecord
  pinnedTenants: string[] | null
  editable: boolean
  createdAt: string | null
  updatedAt: string | null
}

export interface DashboardInput {
  name: string
  description: string | null
  audience: DashboardAudienceRecord
  pinnedTenants: string[] | null
  widgets: DashboardWidgetRecord[]
}

/** One catalog metric — admin-api's `MetricInfo`. */
export interface MetricInfoRecord {
  id: string
  title: string
  description: string
  kind: MetricKind
  unit: MetricUnit
  section: MetricSection
  vertical: string | null
  resourceType: string | null
  /** Charts that fit; the first is the default. */
  charts: DashboardChart[]
  /** Values are money, one set per currency. */
  money: boolean
  /** The `currency` parameter changes the result. */
  currencyAware: boolean
  /** Evaluated as of now; the range is ignored. */
  snapshot: boolean
  /** The `granularity` parameter applies. */
  granular: boolean
  /** Buckets used when a request leaves `granularity` unset; absent means the range decides. */
  defaultGranularity?: 'day' | 'week' | 'month'
  /** `compare` adds the prior period. */
  comparable: boolean
  thresholds?: { warn: number; crit: number; direction: 'above' | 'below' }
  note?: string
}

export interface MetricRangeQuery {
  from?: string
  to?: string
  /** The dashboard the widget belongs to: applies its pinned tenants. */
  dashboard?: string
  /** Keep only this currency (ISO 4217). */
  currency?: string
  granularity?: GranularityParam
  /** Add the prior equal-length period. */
  compare?: boolean
  /** Only this connection (it narrows the caller's scope, never widens it). */
  connection?: string
  /** Only connections of this adapter. */
  platform?: string
  /** With `connection` or `platform`: keep the filter to this vertical. */
  vertical?: string
}

/** A dashboard's connection / adapter filter, as admin-api takes it. */
export interface DashboardConnectionFilter {
  connection?: string
  platform?: string
  /** The dashboard's vertical, which keeps the filter inside it. */
  vertical?: string
}

export interface DashboardConnectionsQuery {
  /** The dashboard being filtered: applies its pinned tenants. */
  dashboard?: string
  vertical?: string
  platform?: string
  /** Case-insensitive substring of the id or label. */
  search?: string
  /** 1–200; admin-api's default is 50. */
  limit?: number
}

/** A connection a dashboard can be filtered to: no tenant, status or secret. */
export interface DashboardConnectionRecord {
  id: string
  label: string | null
  platform: string
  vertical: string
}

export interface DashboardConnectionsRecord {
  /** Matches, at most `limit`: an exact id first, then by label. */
  connections: DashboardConnectionRecord[]
  /** The adapters among the vertical's visible connections (ignoring search and platform). */
  platforms: Array<{ slug: string; name: string; count: number }>
  /** Matches before `limit`. */
  total: number
}

export interface PublicIdentityProvider {
  slug: string
  name: string
  protocol: 'saml' | 'oidc' | 'ldap'
}

export interface IdentityProviderRecord {
  id: string
  name: string
  slug: string
  protocol: 'saml' | 'oidc' | 'ldap'
  enabled: boolean
  config: Record<string, unknown>
  jitEnabled: boolean
  defaultRole: 'admin' | 'operator' | 'viewer'
  /** Scope when no scope rule matches (absent on an older admin-api). */
  defaultScopeMode?: 'all' | 'restricted'
  defaultTenantIds?: string[]
  createdAt: string
  updatedAt: string
  createdBy: string | null
  hasSecret: boolean
}

export interface ScopeRuleRecord {
  id: number
  providerId: string
  priority: number
  claimPath: string
  matchType: 'equals' | 'contains' | 'regex'
  matchValue: string
  tenantIds: string[]
  verticals: '*' | string[]
  createdAt: string
}

export interface RoleMappingRecord {
  id: number
  providerId: string
  priority: number
  claimPath: string
  matchType: 'equals' | 'contains' | 'regex'
  matchValue: string
  role: 'admin' | 'operator' | 'viewer'
  /** Custom role granted on match; null/absent = the built-in `role`. */
  roleId?: string | null
  createdAt: string
}

export interface ScimTokenRecord {
  id: string
  providerId: string
  prefix: string
  label: string | null
  createdAt: string
  createdBy: string | null
  lastUsedAt: string | null
  revokedAt: string | null
}

export interface PlatformConfigRedactedRecord {
  clientId: string | null
  redirectUri: string | null
  scopes: string[] | null
  hasSecret: boolean
  recommendedScopes: string[] | null
  /** Curated read-only scopes for this platform; null when none catalogued. */
  readScopes?: string[] | null
  /** False ⇒ Connect Link admin form disables the scope-group dropdown
   *  for this adapter. Defaults to true when omitted. */
  supportsScopeOverride?: boolean
}

export type ConnectLinkTemplateMode = 'pinned' | 'customer-picks-adapter' | 'self-register'

export interface ConnectLinkTemplateAllowedPlatform {
  vertical: string
  slug: string
}

export interface ConnectLinkTemplateRecord {
  id: number
  tenantId: string
  name: string
  description: string | null
  linkMode: ConnectLinkTemplateMode
  allowedVerticals: string[]
  allowedPlatforms: ConnectLinkTemplateAllowedPlatform[]
  scopeGroupId: number | null
  expiryDays: number
  oneTimeOnly: boolean
  redirectUrl: string | null
  createdAt: string
  createdBy: string | null
}

export interface ConnectLinkTemplateInput {
  tenantId: string
  name: string
  description?: string | null
  linkMode: ConnectLinkTemplateMode
  allowedVerticals?: string[]
  allowedPlatforms?: ConnectLinkTemplateAllowedPlatform[]
  scopeGroupId?: number | null
  expiryDays?: number
  oneTimeOnly?: boolean
  redirectUrl?: string | null
}

export interface ScopeGroupRecord {
  id: number
  vertical: string
  platform: string
  name: string
  scopes: string[]
  createdAt: string
}

export interface TenantRecord {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface TenantDomainRecord {
  domain: string
  tenantId: string
  createdAt: number
}

export interface SyncJobRecord {
  id: string
  vertical: string
  connectionId: string
  platform: string
  tenantId: string | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: Record<string, { synced: number; status: string; error?: string }> | null
  error: string | null
  callbackUrl: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  /** Why the job was queued; null on older jobs. */
  origin?: 'manual' | 'api' | 'connect' | 'boot' | 'schedule' | null
}

export interface DataStoreMetrics {
  mode: string
  path: string
  rows: { total: number; per_vertical: Record<string, number>; oldest_age_ms: number | null }
  sync_jobs: {
    pending: number
    running: number
    failed_recent: number
    per_vertical: Record<string, Record<string, number>>
  }
  db_size_bytes: number | null
  db_size_mb: number | null
  timestamp: string
}

export interface WebhookDeliveryRecord {
  id: string
  subscriptionId: string
  eventId: string
  eventType: string
  url: string
  status: 'pending' | 'delivered' | 'dead'
  attempts: number
  nextAttemptAt: string
  deliveredAt: string | null
  lastStatus: number | null
  lastError: string | null
  createdAt: string
}

export interface ApiKeyRecord {
  /** `live` keys authenticate `/v1/*`; `test` keys the `/test/v1/*` sandbox.
   *  Optional because a deployment on an older admin-api will not send it. */
  mode?: 'live' | 'test'
  id: string
  tenantId: string
  prefix: string
  label: string | null
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
  /** Hard expiry (epoch ms). Absent/null = never expires. */
  expiresAt?: number | null
  /** Scheduled revocation at the end of a rotation grace window (epoch ms). */
  revokeAt?: number | null
  /** Id of the key this one replaced, when minted by a rotation. */
  rotatedFrom?: string | null
}

export interface ApiKeyMint extends ApiKeyRecord {
  /** Returned exactly once at mint time. */
  plaintext: string
}

export interface ApiKeyRotate extends ApiKeyMint {
  /** When the replaced key stops verifying (epoch ms). */
  oldKeyRevokeAt: number
}

export type WebhookFormat = 'opensteward' | 'slack' | 'teams' | 'flat'

export interface WebhookSubRecord {
  id: string
  tenantId: string
  url: string
  /** Operator-supplied name; null when none was given. */
  label?: string | null
  events: string[]
  paused?: boolean
  createdAt: string
  lastFiredAt: string | null
  lastStatus: number | null
  lastError: string | null
  /** Payload shape sent to this endpoint. Absent on rows from an older API. */
  format?: WebhookFormat
  /** Names of the custom headers. Values are never returned by the API. */
  headerNames?: string[]
}

export interface WebhookTestResult {
  id: string
  ok: boolean
  status: number | null
  format: WebhookFormat
  sentBody?: string
  error?: string
}

export interface WebhookSubWithSecret extends WebhookSubRecord {
  /** Plaintext shared secret. Returned exactly once on create. */
  secret: string
}

export interface EndUserSummary {
  id: string
  tenantId: string
  email: string
  displayName: string | null
  externalReference: string | null
  createdAt: string
  updatedAt: string
}

export interface EndUserDetail extends EndUserSummary {
  pii?: {
    firstName?: string
    lastName?: string
    personalIdNumber?: string
    phone?: string
    address?: {
      line1?: string
      line2?: string
      city?: string
      region?: string
      postalCode?: string
      country?: string
    }
  } | null
  sessions?: ConnectSessionRecord[]
  connections?: Array<{ id: string; vertical: string | null; platform: string; createdAt: string }>
}

export interface ConnectSessionRecord {
  id: string
  token: string
  tenantId: string
  endUserId: string | null
  label: string
  allowedVerticals: string[]
  allowedPlatforms: Array<{ vertical: string; slug: string }>
  redirectUrl: string | null
  expiresAt: string
  consumedAt: string | null
  connectionId: string | null
  createdAt: string
  createdBy: string | null
  status: 'active' | 'consumed' | 'expired'
  /** When true, the resulting connection is auto-deleted after the
   *  post-OAuth sync completes. UI surfaces a "One-time" badge. */
  oneTimeOnly: boolean
  /**
   * The address to send the customer, resolved by integration-server
   * (PUBLIC_BASE_URL > companyInfo.baseUrl > the tenant's own domain).
   *
   * Absent when the deployment has no public address configured. Never
   * rebuild it from a base and the token: that misses a tenant's custom
   * domain, and with no base at all it yields the bare path `/connect/<token>`,
   * which resolves against the ADMIN's origin and takes the customer nowhere.
   */
  url?: string
}

export interface ConnectSessionDetail extends ConnectSessionRecord {
  customer: EndUserSummary | null
  connection: { id: string; vertical: string | null; platform: string; createdAt: string } | null
}

// ── Embedded Superset ────────────────────────────────────────────────────

export interface SupersetStatusRecord {
  enabled: boolean
  publicUrl: string | null
}

export interface SupersetDashboardRecord {
  id: string
  title: string
  description: string | null
  embeddedUuid: string
  verticals: string[] | null
  requiredPermission: string | null
  audience: DashboardAudienceRecord
  pinnedTenants: string[] | null
  updatedAt: string
}

export interface SupersetGuestTokenRecord {
  token: string
  expiresAt: string | null
  embeddedUuid: string
  supersetDomain: string
  restricted: boolean
}
