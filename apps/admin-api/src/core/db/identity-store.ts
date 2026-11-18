/**
 * IdentityStore — persistence for enterprise SSO / corporate identity
 * providers (SAML, OIDC, LDAP) plus SCIM provisioning state.
 *
 * Mirrors the sibling-store-over-shared-handle pattern used by
 * RuntimeSettingsStore: constructed with the shared `DbHandle` so it reuses
 * the single backend connection (SQLite or Postgres). Owns its own
 * `migrate()` (driven from the async `create()` factory) to keep the SSO
 * feature self-contained.
 *
 * Secrets (OIDC client secret, LDAP bind password, SAML SP private key, IdP
 * signing cert) are stored AES-256-GCM encrypted via the shared crypto helper
 * with an SSO-specific salt, exactly like CredentialStore encrypts upstream
 * credentials. Encryption stays OUTSIDE the query seam: ciphertext is a base64
 * TEXT column on both dialects, so it is byte-identical across backends.
 */
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'crypto'
import { encrypt, decrypt } from '@opensteward/shared'
import type { DbHandle, DualMigration } from '@opensteward/shared'
import { isUniqueViolation } from './sql-errors'

/** Dedicated salt so SSO secrets derive a different key than connection creds. */
export const SSO_SECRET_SALT = 'opensteward-sso-v1'

/**
 * A provider has a stored secret bundle that will not decrypt — almost always
 * a STORE_SECRET that no longer matches the one the bundle was written with
 * (rotated, or an admin.db restored onto a different host). Distinct from a
 * provider that simply has no secrets, which is an empty bundle.
 */
export class SecretBundleUnreadableError extends Error {
  constructor(
    readonly providerId: string,
    override readonly cause: unknown,
  ) {
    super(
      `Stored secrets for identity provider ${providerId} could not be decrypted — ` +
        'STORE_SECRET does not match the value they were encrypted with.',
    )
    this.name = 'SecretBundleUnreadableError'
  }
}

/**
 * A partial secret update was refused because the stored bundle cannot be read.
 *
 * Merging into a bundle we cannot decrypt would write back only the keys the
 * operator happened to resend, silently discarding the rest. That matters
 * because "unreadable" almost always means unreadable UNDER THE CURRENT KEY —
 * the ciphertext is intact and comes straight back if the right STORE_SECRET is
 * restored, or if `rotate-store-secret` is run. Overwriting it converts a
 * recoverable key mistake into permanent credential loss.
 *
 * So the update is refused and nothing is written. The operator can put the key
 * back, or resend every secret with `replaceUnreadableSecret` to say plainly
 * that they accept losing whatever they do not resend.
 */
export class UnreadableSecretUpdateRefusedError extends Error {
  constructor(readonly providerId: string) {
    super(
      `Stored secrets for identity provider ${providerId} could not be decrypted — ` +
        'STORE_SECRET does not match the value they were encrypted with. The update was ' +
        'refused and nothing was overwritten, because merging into a bundle that cannot be ' +
        'read would discard every secret not resent. Either restore the previous ' +
        'STORE_SECRET (or run rotate-store-secret) to recover them, or resend every secret ' +
        'for this provider with replaceUnreadableSecret to replace the bundle outright.',
    )
    this.name = 'UnreadableSecretUpdateRefusedError'
  }
}

export type IdpProtocol = 'saml' | 'oidc' | 'ldap'
export type Role = 'admin' | 'operator' | 'viewer'
export type RoleMatchType = 'equals' | 'contains' | 'regex'

/** Encrypted secret bundle shape (JSON, then encrypted into secret_enc). */
export interface IdpSecretBundle {
  clientSecret?: string
  ldapBindPassword?: string
  /** SP private key (PEM). When set, SAML AuthnRequests are signed. */
  spPrivateKey?: string
  /** SP public certificate (PEM) matching `spPrivateKey`. Advertised in SP
   *  metadata so the IdP can verify our signed AuthnRequests. */
  spCertificate?: string
  idpCert?: string
}

export type IdpScopeMode = 'all' | 'restricted'

export interface IdentityProviderRow {
  id: string
  name: string
  slug: string
  protocol: IdpProtocol
  enabled: boolean
  config: Record<string, unknown>
  jitEnabled: boolean
  defaultRole: Role
  /** Scope applied when no scope-mapping rule matches (identity_store v2).
   *  `all` = every tenant; `restricted` = only `defaultTenantIds` (none, when
   *  that list is empty). */
  defaultScopeMode: IdpScopeMode
  defaultTenantIds: string[]
  createdAt: number
  updatedAt: number
  createdBy: string | null
  /** True when an encrypted secret bundle is stored. Never the plaintext. */
  hasSecret: boolean
}

export interface IdentityLinkRow {
  id: string
  providerId: string
  externalId: string
  userId: string
  lastLoginAt: number | null
  scimManaged: boolean
  createdAt: number
}

export interface RoleMappingRuleRow {
  id: number
  providerId: string
  priority: number
  claimPath: string
  matchType: RoleMatchType
  matchValue: string
  /** Base role granted on match. For a custom-role rule, that role's base. */
  role: Role
  /** Custom role granted on match (identity_store v2); null/absent = the
   *  built-in `role`. */
  roleId?: string | null
  createdAt: number
}

/**
 * A scope-mapping rule: when the claim matches, the user may see these
 * tenants. Unlike role rules, EVERY matching scope rule applies — the grants
 * are unioned — because group membership is additive ("EU support" plus
 * "Acme account team" sees both).
 */
export interface ScopeMappingRuleRow {
  id: number
  providerId: string
  priority: number
  claimPath: string
  matchType: RoleMatchType
  matchValue: string
  tenantIds: string[]
  /** `'*'` = every vertical of those tenants. */
  verticals: '*' | string[]
  createdAt: number
}

export interface ScimTokenRow {
  id: string
  providerId: string
  prefix: string
  label: string | null
  createdAt: number
  createdBy: string | null
  lastUsedAt: number | null
  revokedAt: number | null
}

export interface ScimTokenMint extends ScimTokenRow {
  /** Returned exactly once at mint time. */
  plaintext: string
}

export interface ScimGroupRow {
  id: string
  providerId: string
  displayName: string
  members: string[]
  createdAt: number
  updatedAt: number
}

export interface SsoTransaction {
  id: string
  providerId: string
  nonce: string | null
  codeVerifier: string | null
  relayState: string | null
  samlRequestId: string | null
  returnTo: string
  createdAt: number
  expiresAt: number
  consumedAt: number | null
}

const SCIM_TOKEN_PREFIX = 'scim_'

// Epoch-millisecond columns are INTEGER on SQLite, BIGINT on Postgres (the
// PostgresDbHandle parses int8 back to a JS number). Boolean-as-INTEGER (0/1)
// columns (enabled, jit_enabled, scim_managed) stay INTEGER on both dialects;
// JSON-as-TEXT columns (config_json, members_json, user_json) stay TEXT on
// both. The role_mapping_rules surrogate key is AUTOINCREMENT on SQLite and an
// IDENTITY column on Postgres — RETURNING `id` works on both backends.
const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS identity_providers (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        slug          TEXT UNIQUE NOT NULL,
        protocol      TEXT NOT NULL,
        enabled       INTEGER NOT NULL DEFAULT 0,
        config_json   TEXT NOT NULL DEFAULT '{}',
        secret_enc    TEXT,
        jit_enabled   INTEGER NOT NULL DEFAULT 1,
        default_role  TEXT NOT NULL DEFAULT 'viewer',
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        created_by    TEXT
      );
      CREATE TABLE IF NOT EXISTS identity_links (
        id            TEXT PRIMARY KEY,
        provider_id   TEXT NOT NULL,
        external_id   TEXT NOT NULL,
        user_id       TEXT NOT NULL,
        last_login_at INTEGER,
        scim_managed  INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        UNIQUE(provider_id, external_id)
      );
      CREATE INDEX IF NOT EXISTS idx_identity_links_user ON identity_links(user_id);
      CREATE TABLE IF NOT EXISTS role_mapping_rules (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id   TEXT NOT NULL,
        priority      INTEGER NOT NULL DEFAULT 100,
        claim_path    TEXT NOT NULL,
        match_type    TEXT NOT NULL,
        match_value   TEXT NOT NULL,
        role          TEXT NOT NULL,
        created_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_role_rules_provider ON role_mapping_rules(provider_id, priority);
      CREATE TABLE IF NOT EXISTS scim_tokens (
        id            TEXT PRIMARY KEY,
        provider_id   TEXT NOT NULL,
        token_hash    TEXT NOT NULL,
        prefix        TEXT NOT NULL,
        label         TEXT,
        created_at    INTEGER NOT NULL,
        created_by    TEXT,
        last_used_at  INTEGER,
        revoked_at    INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_scim_tokens_provider ON scim_tokens(provider_id);
      CREATE TABLE IF NOT EXISTS sso_transactions (
        id              TEXT PRIMARY KEY,
        provider_id     TEXT NOT NULL,
        nonce           TEXT,
        code_verifier   TEXT,
        relay_state     TEXT,
        saml_request_id TEXT,
        return_to       TEXT NOT NULL,
        created_at      INTEGER NOT NULL,
        expires_at      INTEGER NOT NULL,
        consumed_at     INTEGER
      );
      CREATE TABLE IF NOT EXISTS saml_replay (
        assertion_id TEXT PRIMARY KEY,
        expires_at   INTEGER NOT NULL
      );
      -- Backs node-saml's CacheProvider so InResponseTo validation survives the
      -- browser redirect (request id saved at AuthnRequest, checked at response).
      CREATE TABLE IF NOT EXISTS saml_request_cache (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS scim_groups (
        id           TEXT PRIMARY KEY,
        provider_id  TEXT NOT NULL,
        display_name TEXT NOT NULL,
        members_json TEXT NOT NULL DEFAULT '[]',
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scim_groups_provider ON scim_groups(provider_id);
      CREATE TABLE IF NOT EXISTS sso_handoff (
        code        TEXT PRIMARY KEY,
        token       TEXT NOT NULL,
        user_json   TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        expires_at  INTEGER NOT NULL,
        consumed_at INTEGER
      );
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS identity_providers (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        slug          TEXT UNIQUE NOT NULL,
        protocol      TEXT NOT NULL,
        enabled       INTEGER NOT NULL DEFAULT 0,
        config_json   TEXT NOT NULL DEFAULT '{}',
        secret_enc    TEXT,
        jit_enabled   INTEGER NOT NULL DEFAULT 1,
        default_role  TEXT NOT NULL DEFAULT 'viewer',
        created_at    BIGINT NOT NULL,
        updated_at    BIGINT NOT NULL,
        created_by    TEXT
      );
      CREATE TABLE IF NOT EXISTS identity_links (
        id            TEXT PRIMARY KEY,
        provider_id   TEXT NOT NULL,
        external_id   TEXT NOT NULL,
        user_id       TEXT NOT NULL,
        last_login_at BIGINT,
        scim_managed  INTEGER NOT NULL DEFAULT 0,
        created_at    BIGINT NOT NULL,
        UNIQUE(provider_id, external_id)
      );
      CREATE INDEX IF NOT EXISTS idx_identity_links_user ON identity_links(user_id);
      CREATE TABLE IF NOT EXISTS role_mapping_rules (
        id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        provider_id   TEXT NOT NULL,
        priority      INTEGER NOT NULL DEFAULT 100,
        claim_path    TEXT NOT NULL,
        match_type    TEXT NOT NULL,
        match_value   TEXT NOT NULL,
        role          TEXT NOT NULL,
        created_at    BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_role_rules_provider ON role_mapping_rules(provider_id, priority);
      CREATE TABLE IF NOT EXISTS scim_tokens (
        id            TEXT PRIMARY KEY,
        provider_id   TEXT NOT NULL,
        token_hash    TEXT NOT NULL,
        prefix        TEXT NOT NULL,
        label         TEXT,
        created_at    BIGINT NOT NULL,
        created_by    TEXT,
        last_used_at  BIGINT,
        revoked_at    BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_scim_tokens_provider ON scim_tokens(provider_id);
      CREATE TABLE IF NOT EXISTS sso_transactions (
        id              TEXT PRIMARY KEY,
        provider_id     TEXT NOT NULL,
        nonce           TEXT,
        code_verifier   TEXT,
        relay_state     TEXT,
        saml_request_id TEXT,
        return_to       TEXT NOT NULL,
        created_at      BIGINT NOT NULL,
        expires_at      BIGINT NOT NULL,
        consumed_at     BIGINT
      );
      CREATE TABLE IF NOT EXISTS saml_replay (
        assertion_id TEXT PRIMARY KEY,
        expires_at   BIGINT NOT NULL
      );
      -- Backs node-saml's CacheProvider so InResponseTo validation survives the
      -- browser redirect (request id saved at AuthnRequest, checked at response).
      CREATE TABLE IF NOT EXISTS saml_request_cache (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        expires_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS scim_groups (
        id           TEXT PRIMARY KEY,
        provider_id  TEXT NOT NULL,
        display_name TEXT NOT NULL,
        members_json TEXT NOT NULL DEFAULT '[]',
        created_at   BIGINT NOT NULL,
        updated_at   BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scim_groups_provider ON scim_groups(provider_id);
      CREATE TABLE IF NOT EXISTS sso_handoff (
        code        TEXT PRIMARY KEY,
        token       TEXT NOT NULL,
        user_json   TEXT NOT NULL,
        created_at  BIGINT NOT NULL,
        expires_at  BIGINT NOT NULL,
        consumed_at BIGINT
      );
    `,
  },
  {
    // Permission model: custom roles in role-mapping rules, IdP-driven tenant
    // scope. Additive only. Existing providers get `default_scope_mode = 'all'`
    // so every SSO user keeps seeing every tenant until an admin adds scope
    // rules or narrows the default — upgrading must not lock anyone out.
    version: 2,
    sqlite: `
      ALTER TABLE role_mapping_rules ADD COLUMN role_id TEXT;
      ALTER TABLE identity_providers ADD COLUMN default_scope_mode TEXT NOT NULL DEFAULT 'all';
      ALTER TABLE identity_providers ADD COLUMN default_tenant_ids_json TEXT NOT NULL DEFAULT '[]';
      CREATE TABLE IF NOT EXISTS scope_mapping_rules (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id     TEXT NOT NULL,
        priority        INTEGER NOT NULL DEFAULT 100,
        claim_path      TEXT NOT NULL,
        match_type      TEXT NOT NULL,
        match_value     TEXT NOT NULL,
        tenant_ids_json TEXT NOT NULL DEFAULT '[]',
        verticals_json  TEXT NOT NULL DEFAULT '"*"',
        created_at      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scope_rules_provider ON scope_mapping_rules(provider_id, priority);
    `,
    postgres: `
      ALTER TABLE role_mapping_rules ADD COLUMN IF NOT EXISTS role_id TEXT;
      ALTER TABLE identity_providers ADD COLUMN IF NOT EXISTS default_scope_mode TEXT NOT NULL DEFAULT 'all';
      ALTER TABLE identity_providers ADD COLUMN IF NOT EXISTS default_tenant_ids_json TEXT NOT NULL DEFAULT '[]';
      CREATE TABLE IF NOT EXISTS scope_mapping_rules (
        id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        provider_id     TEXT NOT NULL,
        priority        INTEGER NOT NULL DEFAULT 100,
        claim_path      TEXT NOT NULL,
        match_type      TEXT NOT NULL,
        match_value     TEXT NOT NULL,
        tenant_ids_json TEXT NOT NULL DEFAULT '[]',
        verticals_json  TEXT NOT NULL DEFAULT '"*"',
        created_at      BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scope_rules_provider ON scope_mapping_rules(provider_id, priority);
    `,
  },
]

export class IdentityStore {
  private constructor(
    private readonly handle: DbHandle,
    private readonly secret: string,
  ) {}

  /**
   * Construct the store, applying migrations against the shared handle.
   *
   * The DbHandle migrate contract has no sync `onApplied` hook, so we
   * inspect the returned `AppliedMigrationsReport` and write one
   * `schema.migrate` audit row per version that was applied in THIS run,
   * AFTER `migrate()` resolves. Audit writes are best-effort: if `audit_log`
   * does not yet exist (admin_store migrations not run), we swallow rather
   * than block boot.
   */
  static async create(handle: DbHandle, secret: string): Promise<IdentityStore> {
    const report = await handle.migrate('identity_store', MIGRATIONS)
    for (const version of report.applied) {
      try {
        await handle.kysely
          .insertInto('audit_log')
          .values({
            user_id: 'system',
            action: 'schema.migrate',
            vertical: null,
            target_id: 'identity_store',
            detail: JSON.stringify({ version }),
            created_at: Date.now(),
          })
          .execute()
      } catch {
        // audit_log is owned by admin_store; if for any reason its migrations
        // have not run yet, swallow rather than block boot.
      }
    }
    return new IdentityStore(handle, secret)
  }

  // ── Encryption helpers ────────────────────────────────────────────────────

  private encryptBundle(bundle: IdpSecretBundle): string {
    return encrypt(JSON.stringify(bundle), this.secret, SSO_SECRET_SALT)
  }

  /**
   * Decrypt the stored secret bundle for a provider. Server-internal only —
   * never returned over the API.
   *
   * An empty bundle means one thing only: this provider was never given a
   * secret. A bundle that is stored but will not decrypt throws instead,
   * because the two are indistinguishable to every caller and the callers act
   * on the difference — `sso.ts` reads a missing `idpCert` as
   * `500 "SAML provider missing IdP certificate"`, which is a confident, wrong
   * statement about configuration the operator entered correctly and can still
   * see marked as present in the UI.
   */
  async getSecretBundle(providerId: string): Promise<IdpSecretBundle> {
    const row = (await this.handle.kysely
      .selectFrom('identity_providers')
      .select('secret_enc')
      .where('id', '=', providerId)
      .executeTakeFirst()) as { secret_enc: string | null } | undefined
    if (!row?.secret_enc) return {}
    try {
      return JSON.parse(decrypt(row.secret_enc, this.secret, SSO_SECRET_SALT)) as IdpSecretBundle
    } catch (err) {
      throw new SecretBundleUnreadableError(providerId, err)
    }
  }

  // ── Providers ─────────────────────────────────────────────────────────────

  async listProviders(): Promise<IdentityProviderRow[]> {
    const rows = (await this.handle.kysely
      .selectFrom('identity_providers')
      .selectAll()
      .orderBy('name')
      .execute()) as ProviderDbRow[]
    return rows.map(rowToProvider)
  }

  /** Public, unauthenticated subset used to render login buttons. */
  async listEnabledPublic(): Promise<Array<{ slug: string; name: string; protocol: IdpProtocol }>> {
    return (await this.handle.kysely
      .selectFrom('identity_providers')
      .select(['slug', 'name', 'protocol'])
      .where('enabled', '=', 1)
      .orderBy('name')
      .execute()) as Array<{ slug: string; name: string; protocol: IdpProtocol }>
  }

  async getProvider(id: string): Promise<IdentityProviderRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('identity_providers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as ProviderDbRow | undefined
    return row ? rowToProvider(row) : null
  }

  async getProviderBySlug(slug: string): Promise<IdentityProviderRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('identity_providers')
      .selectAll()
      .where('slug', '=', slug)
      .executeTakeFirst()) as ProviderDbRow | undefined
    return row ? rowToProvider(row) : null
  }

  async createProvider(input: {
    name: string
    slug: string
    protocol: IdpProtocol
    enabled?: boolean
    config?: Record<string, unknown>
    secret?: IdpSecretBundle
    jitEnabled?: boolean
    defaultRole?: Role
    createdBy?: string | null
  }): Promise<IdentityProviderRow> {
    const id = randomUUID()
    const now = Date.now()
    const secretEnc =
      input.secret && Object.keys(input.secret).length > 0 ? this.encryptBundle(input.secret) : null
    await this.handle.kysely
      .insertInto('identity_providers')
      .values({
        id,
        name: input.name,
        slug: input.slug,
        protocol: input.protocol,
        enabled: input.enabled ? 1 : 0,
        config_json: JSON.stringify(input.config ?? {}),
        secret_enc: secretEnc,
        jit_enabled: input.jitEnabled === false ? 0 : 1,
        default_role: input.defaultRole ?? 'viewer',
        // New providers grant no tenants until an admin sets a default scope
        // or adds scope rules. Providers that existed before scoping keep
        // `all` through the column default.
        default_scope_mode: 'restricted',
        default_tenant_ids_json: '[]',
        created_at: now,
        updated_at: now,
        created_by: input.createdBy ?? null,
      })
      .execute()
    return (await this.getProvider(id))!
  }

  async updateProvider(
    id: string,
    patch: Partial<{
      name: string
      slug: string
      enabled: boolean
      config: Record<string, unknown>
      secret: IdpSecretBundle
      jitEnabled: boolean
      defaultRole: Role
      /**
       * Accept replacing a bundle that cannot be decrypted. Without it a
       * partial secret update against an unreadable bundle is refused rather
       * than silently dropping the keys that were not resent.
       */
      replaceUnreadableSecret: boolean
    }>,
  ): Promise<IdentityProviderRow | null> {
    const existing = await this.getProvider(id)
    if (!existing) return null
    // Merge secret bundle: only overwrite keys explicitly provided so the UI
    // can leave a secret untouched by omitting it.
    let secretEnc: string | null | undefined
    if (patch.secret !== undefined) {
      // An unreadable bundle cannot be merged into, and writing the patch on
      // its own would discard every key the operator did not resend. Those keys
      // are usually still recoverable — the ciphertext is fine, the key is
      // wrong — so refuse by default and make the operator say they accept the
      // loss. See UnreadableSecretUpdateRefusedError.
      let current: IdpSecretBundle
      try {
        current = await this.getSecretBundle(id)
      } catch (err) {
        if (!(err instanceof SecretBundleUnreadableError)) throw err
        if (!patch.replaceUnreadableSecret) throw new UnreadableSecretUpdateRefusedError(id)
        current = {}
      }
      const merged = { ...current, ...patch.secret }
      // Drop empty-string values so clearing a field removes it.
      for (const k of Object.keys(merged) as (keyof IdpSecretBundle)[]) {
        if (merged[k] === '') delete merged[k]
      }
      secretEnc = Object.keys(merged).length > 0 ? this.encryptBundle(merged) : null
    }
    const next = {
      name: patch.name ?? existing.name,
      slug: patch.slug ?? existing.slug,
      enabled: patch.enabled ?? existing.enabled,
      config: patch.config ?? existing.config,
      jitEnabled: patch.jitEnabled ?? existing.jitEnabled,
      defaultRole: patch.defaultRole ?? existing.defaultRole,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set: Record<string, any> = {
      name: next.name,
      slug: next.slug,
      enabled: next.enabled ? 1 : 0,
      config_json: JSON.stringify(next.config),
      jit_enabled: next.jitEnabled ? 1 : 0,
      default_role: next.defaultRole,
      updated_at: Date.now(),
    }
    if (secretEnc !== undefined) set.secret_enc = secretEnc
    await this.handle.kysely
      .updateTable('identity_providers')
      .set(set)
      .where('id', '=', id)
      .execute()
    return this.getProvider(id)
  }

  async deleteProvider(id: string): Promise<boolean> {
    return this.handle.transaction(async (tx) => {
      await tx.deleteFrom('role_mapping_rules').where('provider_id', '=', id).execute()
      await tx.deleteFrom('scope_mapping_rules').where('provider_id', '=', id).execute()
      await tx.deleteFrom('scim_tokens').where('provider_id', '=', id).execute()
      await tx.deleteFrom('identity_links').where('provider_id', '=', id).execute()
      const res = await tx
        .deleteFrom('identity_providers')
        .where('id', '=', id)
        .executeTakeFirst()
      return Number(res.numDeletedRows) > 0
    })
  }

  // ── Identity links ──────────────────────────────────────────────────────

  async findLink(providerId: string, externalId: string): Promise<IdentityLinkRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('identity_links')
      .selectAll()
      .where('provider_id', '=', providerId)
      .where('external_id', '=', externalId)
      .executeTakeFirst()) as LinkDbRow | undefined
    return row ? rowToLink(row) : null
  }

  async listLinksForProvider(providerId: string): Promise<IdentityLinkRow[]> {
    const rows = (await this.handle.kysely
      .selectFrom('identity_links')
      .selectAll()
      .where('provider_id', '=', providerId)
      .orderBy('created_at', 'asc')
      .execute()) as LinkDbRow[]
    return rows.map(rowToLink)
  }

  async deleteLink(id: string): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom('identity_links')
      .where('id', '=', id)
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }

  async listLinksForUser(userId: string): Promise<IdentityLinkRow[]> {
    const rows = (await this.handle.kysely
      .selectFrom('identity_links')
      .selectAll()
      .where('user_id', '=', userId)
      .execute()) as LinkDbRow[]
    return rows.map(rowToLink)
  }

  async createLink(input: {
    providerId: string
    externalId: string
    userId: string
    scimManaged?: boolean
  }): Promise<IdentityLinkRow> {
    const id = randomUUID()
    const now = Date.now()
    await this.handle.kysely
      .insertInto('identity_links')
      .values({
        id,
        provider_id: input.providerId,
        external_id: input.externalId,
        user_id: input.userId,
        last_login_at: null,
        scim_managed: input.scimManaged ? 1 : 0,
        created_at: now,
      })
      .execute()
    return (await this.findLink(input.providerId, input.externalId))!
  }

  async touchLinkLogin(id: string): Promise<void> {
    await this.handle.kysely
      .updateTable('identity_links')
      .set({ last_login_at: Date.now() })
      .where('id', '=', id)
      .execute()
  }

  async deleteLinksForUser(userId: string): Promise<void> {
    await this.handle.kysely.deleteFrom('identity_links').where('user_id', '=', userId).execute()
  }

  // ── Role-mapping rules ────────────────────────────────────────────────────

  async listRules(providerId: string): Promise<RoleMappingRuleRow[]> {
    const rows = (await this.handle.kysely
      .selectFrom('role_mapping_rules')
      .selectAll()
      .where('provider_id', '=', providerId)
      .orderBy('priority', 'asc')
      .orderBy('id', 'asc')
      .execute()) as RuleDbRow[]
    return rows.map(rowToRule)
  }

  async createRule(input: {
    providerId: string
    priority?: number
    claimPath: string
    matchType: RoleMatchType
    matchValue: string
    role: Role
    /** Custom role granted on match; `role` must then be its base role. */
    roleId?: string | null
  }): Promise<RoleMappingRuleRow> {
    const now = Date.now()
    const inserted = (await this.handle.kysely
      .insertInto('role_mapping_rules')
      .values({
        provider_id: input.providerId,
        priority: input.priority ?? 100,
        claim_path: input.claimPath,
        match_type: input.matchType,
        match_value: input.matchValue,
        role: input.role,
        role_id: input.roleId ?? null,
        created_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow()) as { id: number | string }
    const row = (await this.handle.kysely
      .selectFrom('role_mapping_rules')
      .selectAll()
      .where('id', '=', Number(inserted.id))
      .executeTakeFirstOrThrow()) as RuleDbRow
    return rowToRule(row)
  }

  async deleteRule(id: number, providerId: string): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom('role_mapping_rules')
      .where('id', '=', id)
      .where('provider_id', '=', providerId)
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }

  /** Role-mapping rules (any provider) that grant a custom role — a role
   *  still referenced by one cannot be deleted. */
  async countRulesForRole(roleId: string): Promise<number> {
    const row = await this.handle.kysely
      .selectFrom('role_mapping_rules')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('role_id', '=', roleId)
      .executeTakeFirstOrThrow()
    return Number((row as { count: number | bigint | string }).count)
  }

  /** Keep rules that grant a custom role in step with its base role. */
  async syncRuleBaseRole(roleId: string, role: Role): Promise<void> {
    await this.handle.kysely
      .updateTable('role_mapping_rules')
      .set({ role })
      .where('role_id', '=', roleId)
      .execute()
  }

  // ── Scope-mapping rules ───────────────────────────────────────────────────

  async listScopeRules(providerId: string): Promise<ScopeMappingRuleRow[]> {
    const rows = (await this.handle.kysely
      .selectFrom('scope_mapping_rules')
      .selectAll()
      .where('provider_id', '=', providerId)
      .orderBy('priority', 'asc')
      .orderBy('id', 'asc')
      .execute()) as ScopeRuleDbRow[]
    return rows.map(rowToScopeRule)
  }

  async createScopeRule(input: {
    providerId: string
    priority?: number
    claimPath: string
    matchType: RoleMatchType
    matchValue: string
    tenantIds: string[]
    verticals?: '*' | string[]
  }): Promise<ScopeMappingRuleRow> {
    const inserted = (await this.handle.kysely
      .insertInto('scope_mapping_rules')
      .values({
        provider_id: input.providerId,
        priority: input.priority ?? 100,
        claim_path: input.claimPath,
        match_type: input.matchType,
        match_value: input.matchValue,
        tenant_ids_json: JSON.stringify([...new Set(input.tenantIds)]),
        verticals_json: JSON.stringify(
          input.verticals === undefined || input.verticals === '*' || input.verticals.length === 0
            ? '*'
            : [...new Set(input.verticals)],
        ),
        created_at: Date.now(),
      })
      .returning('id')
      .executeTakeFirstOrThrow()) as { id: number | string }
    const row = (await this.handle.kysely
      .selectFrom('scope_mapping_rules')
      .selectAll()
      .where('id', '=', Number(inserted.id))
      .executeTakeFirstOrThrow()) as ScopeRuleDbRow
    return rowToScopeRule(row)
  }

  async deleteScopeRule(id: number, providerId: string): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom('scope_mapping_rules')
      .where('id', '=', id)
      .where('provider_id', '=', providerId)
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }

  /** Set the scope applied when no scope rule matches. */
  async updateProviderDefaultScope(
    id: string,
    scope: { mode: IdpScopeMode; tenantIds: string[] },
  ): Promise<IdentityProviderRow | null> {
    const res = await this.handle.kysely
      .updateTable('identity_providers')
      .set({
        default_scope_mode: scope.mode,
        default_tenant_ids_json: JSON.stringify(
          scope.mode === 'restricted' ? [...new Set(scope.tenantIds)] : [],
        ),
        updated_at: Date.now(),
      })
      .where('id', '=', id)
      .executeTakeFirst()
    if (Number(res.numUpdatedRows) === 0) return null
    return this.getProvider(id)
  }

  // ── SCIM tokens ───────────────────────────────────────────────────────────

  async mintScimToken(input: {
    providerId: string
    label?: string | null
    createdBy?: string | null
  }): Promise<ScimTokenMint> {
    const id = randomUUID()
    const random = randomBytes(24).toString('base64url')
    const plaintext = `${SCIM_TOKEN_PREFIX}${random}`
    const prefix = plaintext.slice(0, 12)
    const hash = hashToken(plaintext)
    const now = Date.now()
    await this.handle.kysely
      .insertInto('scim_tokens')
      .values({
        id,
        provider_id: input.providerId,
        token_hash: hash,
        prefix,
        label: input.label ?? null,
        created_at: now,
        created_by: input.createdBy ?? null,
      })
      .execute()
    return {
      id,
      providerId: input.providerId,
      prefix,
      label: input.label ?? null,
      createdAt: now,
      createdBy: input.createdBy ?? null,
      lastUsedAt: null,
      revokedAt: null,
      plaintext,
    }
  }

  async listScimTokens(providerId: string): Promise<ScimTokenRow[]> {
    const rows = (await this.handle.kysely
      .selectFrom('scim_tokens')
      .selectAll()
      .where('provider_id', '=', providerId)
      .orderBy('created_at', 'desc')
      .execute()) as ScimTokenDbRow[]
    return rows.map(rowToScimToken)
  }

  async revokeScimToken(id: string): Promise<boolean> {
    const res = await this.handle.kysely
      .updateTable('scim_tokens')
      .set({ revoked_at: Date.now() })
      .where('id', '=', id)
      .where('revoked_at', 'is', null)
      .executeTakeFirst()
    return Number(res.numUpdatedRows) > 0
  }

  /** Constant-time verify a presented SCIM bearer token. Returns the owning
   *  provider id (and marks last_used_at) or null. */
  async verifyScimToken(plaintext: string): Promise<{ tokenId: string; providerId: string } | null> {
    if (!plaintext.startsWith(SCIM_TOKEN_PREFIX)) return null
    const prefix = plaintext.slice(0, 12)
    const candidates = (await this.handle.kysely
      .selectFrom('scim_tokens')
      .select(['id', 'provider_id', 'token_hash'])
      .where('prefix', '=', prefix)
      .where('revoked_at', 'is', null)
      .execute()) as Array<{ id: string; provider_id: string; token_hash: string }>
    const presented = hashToken(plaintext)
    const presentedBuf = Buffer.from(presented, 'hex')
    for (const c of candidates) {
      const stored = Buffer.from(c.token_hash, 'hex')
      if (stored.length === presentedBuf.length && timingSafeEqual(stored, presentedBuf)) {
        await this.handle.kysely
          .updateTable('scim_tokens')
          .set({ last_used_at: Date.now() })
          .where('id', '=', c.id)
          .execute()
        return { tokenId: c.id, providerId: c.provider_id }
      }
    }
    return null
  }

  // ── SSO transactions ──────────────────────────────────────────────────────

  async createTransaction(input: {
    state: string
    providerId: string
    nonce?: string | null
    codeVerifier?: string | null
    relayState?: string | null
    samlRequestId?: string | null
    returnTo: string
    ttlMs?: number
  }): Promise<void> {
    const now = Date.now()
    await this.handle.kysely
      .insertInto('sso_transactions')
      .values({
        id: input.state,
        provider_id: input.providerId,
        nonce: input.nonce ?? null,
        code_verifier: input.codeVerifier
          ? encrypt(input.codeVerifier, this.secret, SSO_SECRET_SALT)
          : null,
        relay_state: input.relayState ?? null,
        saml_request_id: input.samlRequestId ?? null,
        return_to: input.returnTo,
        created_at: now,
        expires_at: now + (input.ttlMs ?? 10 * 60_000),
        consumed_at: null,
      })
      .execute()
  }

  /** Atomically fetch + consume a transaction (single-use). Returns null when
   *  missing, already consumed, or expired. */
  async consumeTransaction(state: string): Promise<SsoTransaction | null> {
    return this.handle.transaction(async (tx) => {
      const row = (await tx
        .selectFrom('sso_transactions')
        .selectAll()
        .where('id', '=', state)
        .executeTakeFirst()) as TxnDbRow | undefined
      if (!row || row.consumed_at !== null || row.expires_at < Date.now()) return null
      const consumedAt = Date.now()
      await tx
        .updateTable('sso_transactions')
        .set({ consumed_at: consumedAt })
        .where('id', '=', state)
        .execute()
      return {
        id: row.id,
        providerId: row.provider_id,
        nonce: row.nonce,
        codeVerifier: row.code_verifier
          ? decrypt(row.code_verifier, this.secret, SSO_SECRET_SALT)
          : null,
        relayState: row.relay_state,
        samlRequestId: row.saml_request_id,
        returnTo: row.return_to,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        consumedAt,
      }
    })
  }

  /** Reject replayed SAML assertions. Returns true if the id is fresh (and
   *  records it); false if it was already seen within its validity window. */
  async recordSamlAssertion(assertionId: string, expiresAt: number): Promise<boolean> {
    await this.handle.kysely
      .deleteFrom('saml_replay')
      .where('expires_at', '<', Date.now())
      .execute()
    try {
      await this.handle.kysely
        .insertInto('saml_replay')
        .values({ assertion_id: assertionId, expires_at: expiresAt })
        .execute()
      return true
    } catch (err) {
      if (isUniqueViolation(err)) return false
      throw err
    }
  }

  // ── SCIM groups (provisioned membership feeding role mapping) ─────────────

  async listScimGroups(providerId: string): Promise<ScimGroupRow[]> {
    const rows = (await this.handle.kysely
      .selectFrom('scim_groups')
      .selectAll()
      .where('provider_id', '=', providerId)
      .orderBy('display_name')
      .execute()) as ScimGroupDbRow[]
    return rows.map(rowToScimGroup)
  }

  async getScimGroup(id: string, providerId: string): Promise<ScimGroupRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('scim_groups')
      .selectAll()
      .where('id', '=', id)
      .where('provider_id', '=', providerId)
      .executeTakeFirst()) as ScimGroupDbRow | undefined
    return row ? rowToScimGroup(row) : null
  }

  async createScimGroup(
    providerId: string,
    displayName: string,
    members: string[] = [],
  ): Promise<ScimGroupRow> {
    const id = randomUUID()
    const now = Date.now()
    await this.handle.kysely
      .insertInto('scim_groups')
      .values({
        id,
        provider_id: providerId,
        display_name: displayName,
        members_json: JSON.stringify(members),
        created_at: now,
        updated_at: now,
      })
      .execute()
    return (await this.getScimGroup(id, providerId))!
  }

  async updateScimGroup(
    id: string,
    providerId: string,
    patch: { displayName?: string; members?: string[] },
  ): Promise<ScimGroupRow | null> {
    const existing = await this.getScimGroup(id, providerId)
    if (!existing) return null
    const displayName = patch.displayName ?? existing.displayName
    const members = patch.members ?? existing.members
    await this.handle.kysely
      .updateTable('scim_groups')
      .set({
        display_name: displayName,
        members_json: JSON.stringify(members),
        updated_at: Date.now(),
      })
      .where('id', '=', id)
      .execute()
    return this.getScimGroup(id, providerId)
  }

  async deleteScimGroup(id: string, providerId: string): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom('scim_groups')
      .where('id', '=', id)
      .where('provider_id', '=', providerId)
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }

  /** Group display names a user (by SCIM resource id == user id) belongs to. */
  async groupsForUser(providerId: string, userId: string): Promise<string[]> {
    const rows = (await this.handle.kysely
      .selectFrom('scim_groups')
      .select(['display_name', 'members_json'])
      .where('provider_id', '=', providerId)
      .execute()) as Array<{ display_name: string; members_json: string }>
    const groups: string[] = []
    for (const r of rows) {
      try {
        const members = JSON.parse(r.members_json) as string[]
        if (members.includes(userId)) groups.push(r.display_name)
      } catch {
        // skip malformed
      }
    }
    return groups
  }

  // ── SAML request-id cache (node-saml CacheProvider backing) ───────────────

  async samlCacheSave(key: string, value: string, ttlMs = 10 * 60_000): Promise<void> {
    await this.handle.kysely
      .deleteFrom('saml_request_cache')
      .where('expires_at', '<', Date.now())
      .execute()
    await this.handle.kysely
      .insertInto('saml_request_cache')
      .values({ key, value, expires_at: Date.now() + ttlMs })
      .onConflict((oc) => oc.column('key').doUpdateSet({ value, expires_at: Date.now() + ttlMs }))
      .execute()
  }

  async samlCacheGet(key: string): Promise<string | null> {
    const row = (await this.handle.kysely
      .selectFrom('saml_request_cache')
      .select(['value', 'expires_at'])
      .where('key', '=', key)
      .executeTakeFirst()) as { value: string; expires_at: number } | undefined
    if (!row || row.expires_at < Date.now()) return null
    return row.value
  }

  async samlCacheRemove(key: string): Promise<void> {
    await this.handle.kysely.deleteFrom('saml_request_cache').where('key', '=', key).execute()
  }

  // ── SSO → UI handoff (single-use code carrying the issued JWT) ─────────────

  async createHandoff(token: string, user: object, ttlMs = 60_000): Promise<string> {
    const code = randomBytes(32).toString('base64url')
    const now = Date.now()
    await this.handle.kysely
      .insertInto('sso_handoff')
      .values({
        code,
        token,
        user_json: JSON.stringify(user),
        created_at: now,
        expires_at: now + ttlMs,
        consumed_at: null,
      })
      .execute()
    return code
  }

  async consumeHandoff(
    code: string,
  ): Promise<{ token: string; user: Record<string, unknown> } | null> {
    return this.handle.transaction(async (tx) => {
      const row = (await tx
        .selectFrom('sso_handoff')
        .selectAll()
        .where('code', '=', code)
        .executeTakeFirst()) as
        | { code: string; token: string; user_json: string; expires_at: number; consumed_at: number | null }
        | undefined
      if (!row || row.consumed_at !== null || row.expires_at < Date.now()) return null
      await tx
        .updateTable('sso_handoff')
        .set({ consumed_at: Date.now() })
        .where('code', '=', code)
        .execute()
      return { token: row.token, user: JSON.parse(row.user_json) as Record<string, unknown> }
    })
  }
}

function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

// ── Row mappers ───────────────────────────────────────────────────────────

interface ProviderDbRow {
  id: string
  name: string
  slug: string
  protocol: IdpProtocol
  enabled: number
  config_json: string
  secret_enc: string | null
  jit_enabled: number
  default_role: Role
  default_scope_mode?: string | null
  default_tenant_ids_json?: string | null
  created_at: number
  updated_at: number
  created_by: string | null
}

/** Parse a JSON array of strings; anything else reads as empty. */
function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function rowToProvider(row: ProviderDbRow): IdentityProviderRow {
  let config: Record<string, unknown> = {}
  try {
    config = JSON.parse(row.config_json) as Record<string, unknown>
  } catch {
    config = {}
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    protocol: row.protocol,
    enabled: row.enabled === 1,
    config,
    jitEnabled: row.jit_enabled === 1,
    defaultRole: row.default_role,
    defaultScopeMode: row.default_scope_mode === 'restricted' ? 'restricted' : 'all',
    defaultTenantIds: parseStringArray(row.default_tenant_ids_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    hasSecret: !!row.secret_enc,
  }
}

interface LinkDbRow {
  id: string
  provider_id: string
  external_id: string
  user_id: string
  last_login_at: number | null
  scim_managed: number
  created_at: number
}

function rowToLink(row: LinkDbRow): IdentityLinkRow {
  return {
    id: row.id,
    providerId: row.provider_id,
    externalId: row.external_id,
    userId: row.user_id,
    lastLoginAt: row.last_login_at,
    scimManaged: row.scim_managed === 1,
    createdAt: row.created_at,
  }
}

interface RuleDbRow {
  id: number
  provider_id: string
  priority: number
  claim_path: string
  match_type: RoleMatchType
  match_value: string
  role: Role
  role_id?: string | null
  created_at: number
}

function rowToRule(row: RuleDbRow): RoleMappingRuleRow {
  return {
    id: Number(row.id),
    providerId: row.provider_id,
    priority: row.priority,
    claimPath: row.claim_path,
    matchType: row.match_type,
    matchValue: row.match_value,
    role: row.role,
    roleId: row.role_id ?? null,
    createdAt: row.created_at,
  }
}

interface ScopeRuleDbRow {
  id: number
  provider_id: string
  priority: number
  claim_path: string
  match_type: RoleMatchType
  match_value: string
  tenant_ids_json: string
  verticals_json: string
  created_at: number
}

function rowToScopeRule(row: ScopeRuleDbRow): ScopeMappingRuleRow {
  let verticals: '*' | string[] = '*'
  try {
    const v = JSON.parse(row.verticals_json)
    if (Array.isArray(v)) {
      const list = v.filter((x): x is string => typeof x === 'string')
      verticals = list.length > 0 ? list : '*'
    }
  } catch {
    verticals = '*'
  }
  return {
    id: Number(row.id),
    providerId: row.provider_id,
    priority: row.priority,
    claimPath: row.claim_path,
    matchType: row.match_type,
    matchValue: row.match_value,
    tenantIds: parseStringArray(row.tenant_ids_json),
    verticals,
    createdAt: row.created_at,
  }
}

interface ScimTokenDbRow {
  id: string
  provider_id: string
  prefix: string
  label: string | null
  created_at: number
  created_by: string | null
  last_used_at: number | null
  revoked_at: number | null
}

function rowToScimToken(row: ScimTokenDbRow): ScimTokenRow {
  return {
    id: row.id,
    providerId: row.provider_id,
    prefix: row.prefix,
    label: row.label,
    createdAt: row.created_at,
    createdBy: row.created_by,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }
}

interface ScimGroupDbRow {
  id: string
  provider_id: string
  display_name: string
  members_json: string
  created_at: number
  updated_at: number
}

function rowToScimGroup(row: ScimGroupDbRow): ScimGroupRow {
  let members: string[]
  try {
    const raw = JSON.parse(row.members_json)
    members = Array.isArray(raw) ? raw.map(String) : []
  } catch {
    members = []
  }
  return {
    id: row.id,
    providerId: row.provider_id,
    displayName: row.display_name,
    members,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

interface TxnDbRow {
  id: string
  provider_id: string
  nonce: string | null
  code_verifier: string | null
  relay_state: string | null
  saml_request_id: string | null
  return_to: string
  created_at: number
  expires_at: number
  consumed_at: number | null
}
