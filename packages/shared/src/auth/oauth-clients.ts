/**
 * OAuthClientStore — the operator's configuration for accepting OIDC bearer
 * tokens on the developer API, as an alternative to `osk_` keys.
 *
 * Three tables, one namespace:
 *
 *   oauth_issuers      an external IdP the deployment trusts (Keycloak, Auth0,
 *                      Okta, Entra ID, or any compliant issuer), plus how to
 *                      read authority out of its tokens.
 *   oauth_clients      a registered service account: (issuer, subject) ->
 *                      tenant + scopes. Unused in `external` authority mode.
 *   oauth_scope_rules  optional mapping from the IdP's own scope vocabulary
 *                      onto OpenSteward's.
 *
 * Sibling of `ApiKeyStore` and lives in the same database, because the
 * verifier reads it on the request hot path.
 *
 * NOTHING HERE IS A SECRET. OpenSteward is only a resource server: verifying
 * a token needs the issuer's *public* keys, so there is no client secret to
 * encrypt, no salt, and no `STORE_SECRET` dependency. `create()` deliberately
 * takes no secret argument — if that ever changes, it means the design drifted
 * into minting or introspecting tokens, which is a different feature.
 *
 * The handle is owned by boot and SHARED with sibling stores — never closed
 * here.
 */
import { randomUUID } from 'crypto'
import type { DbHandle, DualMigration } from '../db/types'
import { assertMcpScopesCompatible } from './api-keys'
import { SANDBOX_ISSUER_PRESET } from './mock-oidc-issuer'

/**
 * Where a request's tenant and scopes come from once its token verifies.
 *
 *   registry   the client row decides. Deleting it cuts off a still-valid
 *              token immediately, exactly like revoking an `osk_` key.
 *   intersect  the client row decides the ceiling; the token's scope claim
 *              may narrow it. Never widens. Revocation still immediate.
 *   external   the token decides both. No client row is consulted, so a
 *              leaked token is live until it expires — the only kill switch
 *              is disabling the issuer.
 */
export type AuthorityMode = 'registry' | 'intersect' | 'external'

export const AUTHORITY_MODES: readonly AuthorityMode[] = ['registry', 'intersect', 'external']

/**
 * Signature algorithms an issuer may be configured to accept.
 *
 * Asymmetric only, and that is the point. A JWKS verifier that accepts `HS*`
 * can be handed a token signed with the issuer's *public* key as the HMAC
 * secret — the public key is published, so anyone can mint one. `none` is the
 * same hole without the arithmetic. Neither is ever allowed, however the
 * operator fills the form in.
 */
export const ALLOWED_ALGORITHMS: readonly string[] = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
]

export const DEFAULT_ALGORITHMS: readonly string[] = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'ES256',
  'ES384',
]

/** Ceiling on `exp - iat`, in seconds, when the issuer does not set one. */
export const DEFAULT_MAX_TOKEN_LIFETIME_S = 3600

export interface OAuthIssuerRow {
  id: string
  /** Operator-facing label. */
  name: string
  /** Which preset seeded the claim names, or 'generic'. Display only. */
  preset: string
  /** The exact `iss` value tokens must carry. */
  issuer: string
  /** Resolved from the discovery document at save time. */
  jwksUri: string
  /** The exact `aud` value tokens must carry. Never blank — see validate(). */
  audience: string
  subjectClaim: string
  scopeClaim: string
  algorithms: string[]
  authorityMode: AuthorityMode
  /** `external` only. Which claim names the tenant. No default, ever. */
  tenantClaim: string | null
  /** `external` only. Tenant values this issuer may assert. Empty = none. */
  allowedTenants: string[]
  maxTokenLifetimeS: number
  enabled: boolean
  /** Set the first time a token from this issuer actually verifies. */
  lastVerifiedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface OAuthClientRow {
  id: string
  issuerId: string
  /** The value of the issuer's `subjectClaim` identifying this client. */
  subject: string
  tenantId: string
  label: string | null
  scopes: string[]
  createdAt: number
  lastUsedAt: number | null
  revokedAt: number | null
}

export interface OAuthScopeRuleRow {
  id: string
  issuerId: string
  priority: number
  /** A value as it appears in the token's scope claim. */
  claimValue: string
  /** The OpenSteward scope it grants. */
  grantedScope: string
}

export class InvalidIssuerError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message)
    this.name = 'InvalidIssuerError'
  }
}

export interface IssuerInput {
  name: string
  preset?: string
  issuer: string
  jwksUri: string
  audience: string
  subjectClaim: string
  scopeClaim: string
  algorithms?: string[]
  authorityMode?: AuthorityMode
  tenantClaim?: string | null
  allowedTenants?: string[]
  maxTokenLifetimeS?: number
  enabled?: boolean
}

/**
 * Reject an issuer configuration that would be unsafe to verify against.
 *
 * Enforced in the store rather than only at the HTTP boundary, because every
 * one of these is a hole rather than a typo and the store is the last place
 * that sees the whole row. `updateIssuer` validates the *merged* result, so a
 * partial patch cannot walk a valid row into an invalid state — switching to
 * `external` without naming a tenant claim is refused, not accepted and then
 * fail-open at request time.
 */
export function validateIssuerInput(input: IssuerInput): void {
  if (!input.name.trim()) throw new InvalidIssuerError('name', 'Name is required.')

  let parsed: URL
  try {
    parsed = new URL(input.issuer)
  } catch {
    throw new InvalidIssuerError('issuer', `Issuer must be an absolute URL: ${input.issuer}`)
  }
  // Plain http would let anyone on the path swap the discovery document and
  // therefore the signing keys. Allowed only where private hosts already are,
  // which is the dev escape hatch a local Keycloak needs — and for the
  // deployment's own test issuer, whose keys are never fetched: the sandbox
  // verifies its tokens against the key it holds in memory, so the URL's
  // scheme protects nothing there, and a local deployment is plain http.
  if (
    parsed.protocol !== 'https:' &&
    process.env['OST_ALLOW_PRIVATE_HOSTS'] !== '1' &&
    input.preset !== SANDBOX_ISSUER_PRESET
  ) {
    throw new InvalidIssuerError('issuer', 'Issuer must use https.')
  }

  try {
    new URL(input.jwksUri)
  } catch {
    throw new InvalidIssuerError('jwksUri', `JWKS URI must be an absolute URL: ${input.jwksUri}`)
  }

  // The single most common resource-server hole. With no audience, every token
  // the issuer mints for any application authenticates here — including an ID
  // token, and including one minted for an unrelated app on the same tenant.
  if (!input.audience.trim()) {
    throw new InvalidIssuerError(
      'audience',
      'Audience is required: without it, any token from this issuer would be accepted.',
    )
  }

  if (!input.subjectClaim.trim()) {
    throw new InvalidIssuerError('subjectClaim', 'Subject claim is required.')
  }
  if (!input.scopeClaim.trim()) {
    throw new InvalidIssuerError('scopeClaim', 'Scope claim is required.')
  }

  const algorithms = input.algorithms ?? [...DEFAULT_ALGORITHMS]
  if (algorithms.length === 0) {
    throw new InvalidIssuerError('algorithms', 'At least one signature algorithm is required.')
  }
  for (const alg of algorithms) {
    if (!ALLOWED_ALGORITHMS.includes(alg)) {
      throw new InvalidIssuerError(
        'algorithms',
        `Algorithm ${alg} is not allowed. Only asymmetric algorithms are accepted ` +
          `(${ALLOWED_ALGORITHMS.join(', ')}) — an HMAC algorithm against a published ` +
          `JWKS lets anyone forge a token with the issuer's public key.`,
      )
    }
  }

  const mode = input.authorityMode ?? 'registry'
  if (!AUTHORITY_MODES.includes(mode)) {
    throw new InvalidIssuerError('authorityMode', `Unknown authority mode: ${mode}`)
  }

  if (mode === 'external') {
    // No default. Guessing `sub` here would silently make every service
    // account its own tenant; guessing anything else would be a lottery.
    if (!input.tenantClaim?.trim()) {
      throw new InvalidIssuerError(
        'tenantClaim',
        'External authority mode requires a tenant claim: the tenant now arrives in the ' +
          'token, so which claim carries it must be stated explicitly.',
      )
    }
    // An empty allow-list is honoured as "admit nobody" at request time rather
    // than refused here, so an operator can stage the issuer before deciding
    // which tenants it may assert. The lockout guard on
    // `auth.dev_api_keys_enabled` is what stops that staging state from being
    // mistaken for a working configuration.
  }

  const lifetime = input.maxTokenLifetimeS ?? DEFAULT_MAX_TOKEN_LIFETIME_S
  if (!Number.isInteger(lifetime) || lifetime <= 0) {
    throw new InvalidIssuerError(
      'maxTokenLifetimeS',
      'Maximum token lifetime must be a positive whole number of seconds.',
    )
  }
}

// Epoch-millisecond columns are INTEGER on SQLite and BIGINT on Postgres (the
// PostgresDbHandle parses int8 back to a JS number). `enabled` is a 0/1
// boolean-as-INTEGER on both dialects, matching `adapter_settings`. `scopes`,
// `algorithms` and `allowed_tenants` are JSON-as-TEXT (parsed in JS). No
// column holds ciphertext, because nothing here is a secret.
const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS oauth_issuers (
        id                   TEXT PRIMARY KEY,
        name                 TEXT NOT NULL,
        preset               TEXT NOT NULL DEFAULT 'generic',
        issuer               TEXT NOT NULL UNIQUE,
        jwks_uri             TEXT NOT NULL,
        audience             TEXT NOT NULL,
        subject_claim        TEXT NOT NULL,
        scope_claim          TEXT NOT NULL,
        algorithms           TEXT NOT NULL,
        authority_mode       TEXT NOT NULL DEFAULT 'registry',
        tenant_claim         TEXT,
        allowed_tenants      TEXT NOT NULL DEFAULT '[]',
        max_token_lifetime_s INTEGER NOT NULL DEFAULT 3600,
        enabled              INTEGER NOT NULL DEFAULT 0,
        last_verified_at     INTEGER,
        created_at           INTEGER NOT NULL,
        updated_at           INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS oauth_clients (
        id            TEXT PRIMARY KEY,
        issuer_id     TEXT NOT NULL,
        subject       TEXT NOT NULL,
        tenant_id     TEXT NOT NULL,
        label         TEXT,
        scopes        TEXT NOT NULL DEFAULT '[]',
        created_at    INTEGER NOT NULL,
        last_used_at  INTEGER,
        revoked_at    INTEGER
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_clients_subject
        ON oauth_clients (issuer_id, subject);
      CREATE INDEX IF NOT EXISTS idx_oauth_clients_tenant
        ON oauth_clients (tenant_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS oauth_scope_rules (
        id            TEXT PRIMARY KEY,
        issuer_id     TEXT NOT NULL,
        priority      INTEGER NOT NULL DEFAULT 0,
        claim_value   TEXT NOT NULL,
        granted_scope TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_oauth_scope_rules_issuer
        ON oauth_scope_rules (issuer_id, priority ASC);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS oauth_issuers (
        id                   TEXT PRIMARY KEY,
        name                 TEXT NOT NULL,
        preset               TEXT NOT NULL DEFAULT 'generic',
        issuer               TEXT NOT NULL UNIQUE,
        jwks_uri             TEXT NOT NULL,
        audience             TEXT NOT NULL,
        subject_claim        TEXT NOT NULL,
        scope_claim          TEXT NOT NULL,
        algorithms           TEXT NOT NULL,
        authority_mode       TEXT NOT NULL DEFAULT 'registry',
        tenant_claim         TEXT,
        allowed_tenants      TEXT NOT NULL DEFAULT '[]',
        max_token_lifetime_s INTEGER NOT NULL DEFAULT 3600,
        enabled              INTEGER NOT NULL DEFAULT 0,
        last_verified_at     BIGINT,
        created_at           BIGINT NOT NULL,
        updated_at           BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS oauth_clients (
        id            TEXT PRIMARY KEY,
        issuer_id     TEXT NOT NULL,
        subject       TEXT NOT NULL,
        tenant_id     TEXT NOT NULL,
        label         TEXT,
        scopes        TEXT NOT NULL DEFAULT '[]',
        created_at    BIGINT NOT NULL,
        last_used_at  BIGINT,
        revoked_at    BIGINT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_clients_subject
        ON oauth_clients (issuer_id, subject);
      CREATE INDEX IF NOT EXISTS idx_oauth_clients_tenant
        ON oauth_clients (tenant_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS oauth_scope_rules (
        id            TEXT PRIMARY KEY,
        issuer_id     TEXT NOT NULL,
        priority      INTEGER NOT NULL DEFAULT 0,
        claim_value   TEXT NOT NULL,
        granted_scope TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_oauth_scope_rules_issuer
        ON oauth_scope_rules (issuer_id, priority ASC);
    `,
  },
]

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const arr: unknown = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as string[]) : []
  } catch {
    return []
  }
}

interface RawIssuer {
  id: string
  name: string
  preset: string
  issuer: string
  jwks_uri: string
  audience: string
  subject_claim: string
  scope_claim: string
  algorithms: string | null
  authority_mode: string
  tenant_claim: string | null
  allowed_tenants: string | null
  max_token_lifetime_s: number
  enabled: number
  last_verified_at: number | null
  created_at: number
  updated_at: number
}

interface RawClient {
  id: string
  issuer_id: string
  subject: string
  tenant_id: string
  label: string | null
  scopes: string | null
  created_at: number
  last_used_at: number | null
  revoked_at: number | null
}

const ISSUER_COLUMNS = [
  'id',
  'name',
  'preset',
  'issuer',
  'jwks_uri',
  'audience',
  'subject_claim',
  'scope_claim',
  'algorithms',
  'authority_mode',
  'tenant_claim',
  'allowed_tenants',
  'max_token_lifetime_s',
  'enabled',
  'last_verified_at',
  'created_at',
  'updated_at',
] as const

const CLIENT_COLUMNS = [
  'id',
  'issuer_id',
  'subject',
  'tenant_id',
  'label',
  'scopes',
  'created_at',
  'last_used_at',
  'revoked_at',
] as const

export class OAuthClientStore {
  private constructor(private readonly handle: DbHandle) {}

  /**
   * Open the store against the shared handle. BORROWER — the handle is owned
   * by the boot layer and MUST NOT be closed here.
   *
   * Takes no secret: see the note at the top of this file.
   */
  static async create(handle: DbHandle): Promise<OAuthClientStore> {
    await handle.migrate('oauth_issuers', MIGRATIONS)
    return new OAuthClientStore(handle)
  }

  private hydrateIssuer(row: RawIssuer): OAuthIssuerRow {
    const algorithms = parseJsonArray(row.algorithms)
    return {
      id: row.id,
      name: row.name,
      preset: row.preset,
      issuer: row.issuer,
      jwksUri: row.jwks_uri,
      audience: row.audience,
      subjectClaim: row.subject_claim,
      scopeClaim: row.scope_claim,
      // A row whose algorithm list somehow came back empty falls back to the
      // safe default rather than to "any algorithm the token names".
      algorithms: algorithms.length > 0 ? algorithms : [...DEFAULT_ALGORITHMS],
      authorityMode: AUTHORITY_MODES.includes(row.authority_mode as AuthorityMode)
        ? (row.authority_mode as AuthorityMode)
        : 'registry',
      tenantClaim: row.tenant_claim,
      allowedTenants: parseJsonArray(row.allowed_tenants),
      maxTokenLifetimeS: row.max_token_lifetime_s,
      enabled: row.enabled === 1,
      lastVerifiedAt: row.last_verified_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private hydrateClient(row: RawClient): OAuthClientRow {
    return {
      id: row.id,
      issuerId: row.issuer_id,
      subject: row.subject,
      tenantId: row.tenant_id,
      label: row.label,
      scopes: parseJsonArray(row.scopes),
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
    }
  }

  // ---- issuers ----------------------------------------------------------

  async createIssuer(input: IssuerInput): Promise<OAuthIssuerRow> {
    validateIssuerInput(input)
    const id = randomUUID()
    const now = Date.now()
    await this.handle.kysely
      .insertInto('oauth_issuers')
      .values({
        id,
        name: input.name.trim(),
        preset: input.preset ?? 'generic',
        issuer: input.issuer,
        jwks_uri: input.jwksUri,
        audience: input.audience.trim(),
        subject_claim: input.subjectClaim.trim(),
        scope_claim: input.scopeClaim.trim(),
        algorithms: JSON.stringify(input.algorithms ?? [...DEFAULT_ALGORITHMS]),
        authority_mode: input.authorityMode ?? 'registry',
        tenant_claim: input.tenantClaim?.trim() || null,
        allowed_tenants: JSON.stringify(input.allowedTenants ?? []),
        max_token_lifetime_s: input.maxTokenLifetimeS ?? DEFAULT_MAX_TOKEN_LIFETIME_S,
        enabled: input.enabled === false ? 0 : 1,
        last_verified_at: null,
        created_at: now,
        updated_at: now,
      })
      .execute()
    const created = await this.getIssuer(id)
    if (!created) throw new Error(`Issuer ${id} vanished immediately after insert.`)
    return created
  }

  async getIssuer(id: string): Promise<OAuthIssuerRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('oauth_issuers')
      .select([...ISSUER_COLUMNS])
      .where('id', '=', id)
      .executeTakeFirst()) as RawIssuer | undefined
    return row ? this.hydrateIssuer(row) : null
  }

  /** Look an issuer up by the `iss` value a token carries. */
  async getIssuerByIss(iss: string): Promise<OAuthIssuerRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('oauth_issuers')
      .select([...ISSUER_COLUMNS])
      .where('issuer', '=', iss)
      .executeTakeFirst()) as RawIssuer | undefined
    return row ? this.hydrateIssuer(row) : null
  }

  async listIssuers(): Promise<OAuthIssuerRow[]> {
    const rows = (await this.handle.kysely
      .selectFrom('oauth_issuers')
      .select([...ISSUER_COLUMNS])
      .orderBy('created_at', 'desc')
      .execute()) as RawIssuer[]
    return rows.map((r) => this.hydrateIssuer(r))
  }

  /**
   * Merge a patch into an existing issuer.
   *
   * Validates the MERGED row, not the patch — otherwise flipping
   * `authorityMode` to `external` on its own would land a row with no tenant
   * claim, which fails open at request time rather than at save time.
   */
  async updateIssuer(id: string, patch: Partial<IssuerInput>): Promise<OAuthIssuerRow | null> {
    const existing = await this.getIssuer(id)
    if (!existing) return null

    const merged: IssuerInput = {
      name: patch.name ?? existing.name,
      preset: patch.preset ?? existing.preset,
      issuer: patch.issuer ?? existing.issuer,
      jwksUri: patch.jwksUri ?? existing.jwksUri,
      audience: patch.audience ?? existing.audience,
      subjectClaim: patch.subjectClaim ?? existing.subjectClaim,
      scopeClaim: patch.scopeClaim ?? existing.scopeClaim,
      algorithms: patch.algorithms ?? existing.algorithms,
      authorityMode: patch.authorityMode ?? existing.authorityMode,
      tenantClaim: patch.tenantClaim !== undefined ? patch.tenantClaim : existing.tenantClaim,
      allowedTenants: patch.allowedTenants ?? existing.allowedTenants,
      maxTokenLifetimeS: patch.maxTokenLifetimeS ?? existing.maxTokenLifetimeS,
      enabled: patch.enabled ?? existing.enabled,
    }
    validateIssuerInput(merged)

    // Changing what the deployment trusts invalidates the proof that it works.
    // Only a fresh successful verification may set it again.
    const identityChanged =
      merged.issuer !== existing.issuer ||
      merged.jwksUri !== existing.jwksUri ||
      merged.audience !== existing.audience

    await this.handle.kysely
      .updateTable('oauth_issuers')
      .set({
        name: merged.name.trim(),
        preset: merged.preset ?? 'generic',
        issuer: merged.issuer,
        jwks_uri: merged.jwksUri,
        audience: merged.audience.trim(),
        subject_claim: merged.subjectClaim.trim(),
        scope_claim: merged.scopeClaim.trim(),
        algorithms: JSON.stringify(merged.algorithms ?? [...DEFAULT_ALGORITHMS]),
        authority_mode: merged.authorityMode ?? 'registry',
        tenant_claim: merged.tenantClaim?.trim() || null,
        allowed_tenants: JSON.stringify(merged.allowedTenants ?? []),
        max_token_lifetime_s: merged.maxTokenLifetimeS ?? DEFAULT_MAX_TOKEN_LIFETIME_S,
        enabled: merged.enabled === false ? 0 : 1,
        ...(identityChanged ? { last_verified_at: null } : {}),
        updated_at: Date.now(),
      })
      .where('id', '=', id)
      .execute()
    return this.getIssuer(id)
  }

  /**
   * Record that a token from this issuer verified. Read by the lockout guard
   * on `auth.dev_api_keys_enabled`, which refuses to switch API keys off
   * against an issuer that has never actually admitted anybody.
   */
  async markVerified(id: string, at = Date.now()): Promise<void> {
    await this.handle.kysely
      .updateTable('oauth_issuers')
      .set({ last_verified_at: at })
      .where('id', '=', id)
      .execute()
  }

  /** Removes the issuer and everything scoped to it. */
  async deleteIssuer(id: string): Promise<boolean> {
    return this.handle.transaction(async (tx) => {
      await tx.deleteFrom('oauth_scope_rules').where('issuer_id', '=', id).execute()
      await tx.deleteFrom('oauth_clients').where('issuer_id', '=', id).execute()
      const res = await tx.deleteFrom('oauth_issuers').where('id', '=', id).executeTakeFirst()
      return Number(res.numDeletedRows) > 0
    })
  }

  /**
   * Could an OIDC bearer token actually get somebody in right now?
   *
   * Read by the lockout guard on `auth.dev_api_keys_enabled`. Switching API
   * keys off against an issuer that is disabled, has never verified a token,
   * or admits nobody locks every developer out of a running deployment, and
   * the only way back is `X-Admin-Secret`. `reason` is written for the
   * operator who is about to be told no.
   */
  async readiness(): Promise<{ ready: boolean; reason: string }> {
    const issuers = await this.listIssuers()
    if (issuers.length === 0) {
      return { ready: false, reason: 'No OIDC issuer is configured.' }
    }
    // The deployment's own test issuer never counts: its tokens are refused
    // on /v1/*, so it can admit nobody there — and it is the one issuer that
    // gets "verified" by tokens the deployment minted itself.
    const enabled = issuers.filter((i) => i.enabled && i.preset !== SANDBOX_ISSUER_PRESET)
    if (enabled.length === 0) {
      const onlySandbox = issuers.some((i) => i.enabled && i.preset === SANDBOX_ISSUER_PRESET)
      return {
        ready: false,
        reason: onlySandbox
          ? 'Only the sandbox test issuer is enabled; its tokens work on /test/v1 only, so nobody could reach /v1.'
          : 'No OIDC issuer is enabled.',
      }
    }

    const blocked: string[] = []
    for (const issuer of enabled) {
      // "Verified" means a real token from this issuer actually passed. The
      // local-login setting can only advise this; here it is checkable, so it
      // is checked.
      if (issuer.lastVerifiedAt === null) {
        blocked.push(`${issuer.name} has never verified a token`)
        continue
      }
      if (issuer.authorityMode === 'external') {
        if (issuer.allowedTenants.length === 0) {
          blocked.push(`${issuer.name} has an empty tenant allow-list, so it admits nobody`)
          continue
        }
      } else if (!(await this.hasActiveClient(issuer.id))) {
        blocked.push(`${issuer.name} has no registered clients`)
        continue
      }
      return { ready: true, reason: `${issuer.name} is configured and has verified a token.` }
    }
    return { ready: false, reason: blocked.join('; ') + '.' }
  }

  // ---- clients ----------------------------------------------------------

  async createClient(input: {
    issuerId: string
    subject: string
    tenantId: string
    label?: string | null
    scopes: string[]
  }): Promise<OAuthClientRow> {
    // Same guard as minting an API key: `mcp:read` marks a principal read-only
    // at the auth layer, so pairing it with write authority is incoherent and
    // is refused here rather than at the first write attempt.
    assertMcpScopesCompatible(input.scopes)
    const id = randomUUID()
    const now = Date.now()
    await this.handle.kysely
      .insertInto('oauth_clients')
      .values({
        id,
        issuer_id: input.issuerId,
        subject: input.subject,
        tenant_id: input.tenantId,
        label: input.label ?? null,
        scopes: JSON.stringify(input.scopes),
        created_at: now,
        last_used_at: null,
        revoked_at: null,
      })
      .execute()
    return {
      id,
      issuerId: input.issuerId,
      subject: input.subject,
      tenantId: input.tenantId,
      label: input.label ?? null,
      scopes: input.scopes,
      createdAt: now,
      lastUsedAt: null,
      revokedAt: null,
    }
  }

  /** The hot-path lookup. Revoked rows are invisible, so revocation bites at once. */
  async getClientBySubject(issuerId: string, subject: string): Promise<OAuthClientRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('oauth_clients')
      .select([...CLIENT_COLUMNS])
      .where('issuer_id', '=', issuerId)
      .where('subject', '=', subject)
      .where('revoked_at', 'is', null)
      .executeTakeFirst()) as RawClient | undefined
    return row ? this.hydrateClient(row) : null
  }

  async listClients(issuerId?: string): Promise<OAuthClientRow[]> {
    let q = this.handle.kysely.selectFrom('oauth_clients').select([...CLIENT_COLUMNS])
    if (issuerId) q = q.where('issuer_id', '=', issuerId)
    const rows = (await q.orderBy('created_at', 'desc').execute()) as RawClient[]
    return rows.map((r) => this.hydrateClient(r))
  }

  /** True when at least one client could still authenticate against `issuerId`. */
  async hasActiveClient(issuerId: string): Promise<boolean> {
    const row = await this.handle.kysely
      .selectFrom('oauth_clients')
      .select(['id'])
      .where('issuer_id', '=', issuerId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst()
    return row !== undefined
  }

  async revokeClient(id: string): Promise<boolean> {
    const res = await this.handle.kysely
      .updateTable('oauth_clients')
      .set({ revoked_at: Date.now() })
      .where('id', '=', id)
      .where('revoked_at', 'is', null)
      .executeTakeFirst()
    return Number(res.numUpdatedRows) > 0
  }

  async touchClient(id: string, at = Date.now()): Promise<void> {
    await this.handle.kysely
      .updateTable('oauth_clients')
      .set({ last_used_at: at })
      .where('id', '=', id)
      .execute()
  }

  // ---- scope rules ------------------------------------------------------

  async listRules(issuerId: string): Promise<OAuthScopeRuleRow[]> {
    const rows = (await this.handle.kysely
      .selectFrom('oauth_scope_rules')
      .select(['id', 'issuer_id', 'priority', 'claim_value', 'granted_scope'])
      .where('issuer_id', '=', issuerId)
      .orderBy('priority', 'asc')
      .execute()) as Array<{
      id: string
      issuer_id: string
      priority: number
      claim_value: string
      granted_scope: string
    }>
    return rows.map((r) => ({
      id: r.id,
      issuerId: r.issuer_id,
      priority: r.priority,
      claimValue: r.claim_value,
      grantedScope: r.granted_scope,
    }))
  }

  async createRule(input: {
    issuerId: string
    priority?: number
    claimValue: string
    grantedScope: string
  }): Promise<OAuthScopeRuleRow> {
    const id = randomUUID()
    const priority = input.priority ?? 0
    await this.handle.kysely
      .insertInto('oauth_scope_rules')
      .values({
        id,
        issuer_id: input.issuerId,
        priority,
        claim_value: input.claimValue,
        granted_scope: input.grantedScope,
      })
      .execute()
    return {
      id,
      issuerId: input.issuerId,
      priority,
      claimValue: input.claimValue,
      grantedScope: input.grantedScope,
    }
  }

  async deleteRule(id: string): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom('oauth_scope_rules')
      .where('id', '=', id)
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }
}
