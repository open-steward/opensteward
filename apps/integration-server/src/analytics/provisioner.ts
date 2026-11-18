/**
 * Provisioning and principal lifecycle for read-only SQL access.
 *
 * Two modes:
 *
 *   managed  ANALYTICS_ADMIN_DATABASE_URL is set. That role needs CREATEROLE
 *            and ownership of (or GRANT rights on) the store tables. The
 *            service runs the provisioning script itself — on boot when the
 *            catalog hash differs from the deployed one, and on demand — and
 *            creates, rotates and revokes principals.
 *   manual   No admin URL (managed Postgres that will not grant CREATEROLE to
 *            the app). The service only GENERATES the SQL: the provisioning
 *            script, and the statements for each principal operation, which
 *            an operator runs with their own admin credentials.
 *
 * Provisioning runs in one transaction under `pg_advisory_xact_lock`, so
 * replicas booting together serialize and the second finds nothing to do.
 * The version N the alias schemas point at is bumped only by a BREAKING
 * catalog change (a view or column removed, a type changed); additive changes
 * rebuild version N in place. The previous version is kept for clients pinned
 * to it, rebuilt with the current masks.
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes, randomInt } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { deriveMaskKey, type DbHandle } from '@opensteward/shared'
import { PrincipalsStore, type PrincipalRecord } from './principals-store'
import {
  ADVISORY_LOCK_KEY,
  ALIAS_PII_SCHEMA,
  ALIAS_SCHEMA,
  createPrincipalStatements,
  generateProvisionScript,
  revokePrincipalStatements,
  roleNames,
  rotatePrincipalStatements,
  terminateSessionsStatement,
  type BaseTables,
  type CatalogVersion,
  type PrincipalScope,
  type QualifiedName,
} from './sql-generator'
import { buildCatalog, diffCatalogs, sqlName, type AnalyticsCatalog } from './view-catalog'

export interface AnalyticsConfig {
  /** Admin connection (CREATEROLE). Unset → manual mode. */
  adminDatabaseUrl?: string
  /** Prefix for every role this deployment creates (roles are cluster-global). Default `os`. */
  rolePrefix: string
  /** Host BI tools should connect to (e.g. a read replica), advertised in status. */
  readHost?: string
}

export interface Logger {
  info(msg: string): void
  warn(obj: unknown, msg?: string): void
}

export class AnalyticsError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface AnalyticsStatus {
  backend: 'postgres' | 'sqlite'
  mode: 'managed' | 'manual'
  provisioned: boolean
  version: number | null
  /** Hash of the catalog deployed in the database. */
  hash: string | null
  /** Hash of this build's catalog. */
  catalogHash: string
  upToDate: boolean
  readHost: string | null
  database: string | null
  schemas: { masked: string; pii: string }
  pgcrypto: boolean | null
  warnings: string[]
}

export interface ProvisionResult {
  changed: boolean
  version: number
  hash: string
  breaking: boolean
  changes: string[]
  warnings: string[]
}

export interface CreatePrincipalInput {
  label: string
  pii: boolean
  scope: PrincipalScope
  expiresAt: number | null
  connectionLimit: number
  createdBy: string | null
}

export interface PrincipalSecretResult {
  principal: PrincipalRecord
  /** Plaintext password: returned here once, never stored. */
  password: string
  /** Manual mode: the SQL an operator must run. Contains only the SCRAM verifier. */
  script?: string
  sessionsTerminated?: number | null
}

interface LatestVersion {
  version: number
  hash: string
  catalog: Pick<AnalyticsCatalog, 'views'>
}

// ── Passwords ────────────────────────────────────────────────────────────

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/** 40 characters from a 56-symbol alphabet: ~232 bits, no characters needing escape in a URL. */
export function generatePassword(length = 40): string {
  let out = ''
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]
  return out
}

/**
 * A SCRAM-SHA-256 verifier (RFC 5802/7677, Postgres's stored format). The
 * role is created with this, never the plaintext, so a `log_statement = ddl`
 * server log does not capture a usable password.
 */
export function scramVerifier(password: string, iterations = 4096, salt = randomBytes(16)): string {
  const salted = pbkdf2Sync(password.normalize('NFKC'), salt, iterations, 32, 'sha256')
  const clientKey = createHmac('sha256', salted).update('Client Key').digest()
  const storedKey = createHash('sha256').update(clientKey).digest()
  const serverKey = createHmac('sha256', salted).update('Server Key').digest()
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`
}

/** `os_sql_<slug>_<6 random>` within Postgres's 63-byte identifier limit. */
export function principalRoleName(
  prefix: string,
  label: string,
  suffix = randomBytes(3).toString('hex'),
): string {
  const head = `${prefix}_sql_`
  const room = 63 - head.length - suffix.length - 1
  const base = /[a-z0-9]/i.test(label) ? sqlName(label) : 'principal'
  const slug = base.slice(0, room).replace(/_+$/, '') || 'principal'
  return `${head}${slug}_${suffix}`
}

// ── Service ──────────────────────────────────────────────────────────────

export interface AnalyticsServiceOptions {
  dialect: 'sqlite' | 'postgres'
  /** DATABASE_URL — the store tables' database (Postgres only). */
  databaseUrl?: string
  /** Credential-family handle; holds the principals metadata table. */
  handle: DbHandle
  storeSecret: string
  config: AnalyticsConfig
  /** Override for tests; defaults to this build's catalog. */
  catalog?: AnalyticsCatalog
  logger?: Logger
}

export class AnalyticsService {
  readonly backend: 'postgres' | 'sqlite'
  readonly mode: 'managed' | 'manual'
  readonly catalog: AnalyticsCatalog
  readonly prefix: string
  private mainPool?: Pool
  private adminPool?: Pool
  private principalsStore?: PrincipalsStore
  private readonly log?: Logger

  private constructor(private readonly opts: AnalyticsServiceOptions) {
    this.backend = opts.dialect
    this.mode = opts.config.adminDatabaseUrl ? 'managed' : 'manual'
    this.catalog = opts.catalog ?? buildCatalog()
    this.prefix = opts.config.rolePrefix
    roleNames(this.prefix) // validates the prefix at boot
    this.log = opts.logger
  }

  static async create(opts: AnalyticsServiceOptions): Promise<AnalyticsService> {
    const svc = new AnalyticsService(opts)
    if (svc.backend === 'postgres') {
      if (!opts.databaseUrl) throw new Error('analytics: Postgres backend without a DATABASE_URL')
      svc.principalsStore = await PrincipalsStore.create(opts.handle)
    }
    return svc
  }

  get readHost(): string | null {
    return this.opts.config.readHost ?? null
  }

  private requirePostgres(): void {
    if (this.backend !== 'postgres') {
      throw new AnalyticsError(
        409,
        'POSTGRES_REQUIRED',
        'Read-only SQL access needs the Postgres backend (set DATABASE_URL).',
      )
    }
  }

  private main(): Pool {
    this.requirePostgres()
    this.mainPool ??= this.pool(this.opts.databaseUrl!)
    return this.mainPool
  }

  private admin(): Pool {
    this.requirePostgres()
    if (!this.opts.config.adminDatabaseUrl) {
      throw new AnalyticsError(
        409,
        'MANUAL_MODE',
        'ANALYTICS_ADMIN_DATABASE_URL is not set; use the generated script instead.',
      )
    }
    this.adminPool ??= this.pool(this.opts.config.adminDatabaseUrl)
    return this.adminPool
  }

  private pool(connectionString: string): Pool {
    const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 10_000 })
    // An idle client dropped by the server (restart, failover, terminate)
    // emits on the pool; unhandled, that would crash the process.
    pool.on('error', (err) => this.log?.warn({ err }, 'analytics: idle database connection lost'))
    return pool
  }

  private principals(): PrincipalsStore {
    this.requirePostgres()
    return this.principalsStore!
  }

  async close(): Promise<void> {
    await Promise.all([this.mainPool?.end(), this.adminPool?.end()])
    this.mainPool = undefined
    this.adminPool = undefined
  }

  // ── Introspection ──────────────────────────────────────────────────────

  /** Where the store tables live, resolved with the app's own search_path. */
  async baseTables(): Promise<BaseTables> {
    const find = async (name: string): Promise<QualifiedName | null> => {
      const r = await this.main().query<{ schema: string; name: string }>(
        `SELECT n.nspname AS schema, c.relname AS name
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.oid = to_regclass($1)`,
        [name],
      )
      return r.rows[0] ?? null
    }
    const [resources, credentials, syncJobs, tenants] = await Promise.all([
      find('resources'),
      find('credentials'),
      find('sync_jobs'),
      find('tenants'),
    ])
    if (!credentials) {
      throw new AnalyticsError(409, 'NOT_READY', 'The credentials table does not exist yet.')
    }
    if (!resources) {
      throw new AnalyticsError(
        409,
        'DATA_STORE_DISABLED',
        'The resources table does not exist (DATA_STORE_MODE=passthrough stores nothing to query).',
      )
    }
    return { resources, credentials, syncJobs, tenants }
  }

  private async appRole(): Promise<string> {
    const r = await this.main().query<{ u: string }>('SELECT current_user::text AS u')
    return r.rows[0]!.u
  }

  private async latest(q: Pool | PoolClient): Promise<LatestVersion | null> {
    try {
      const exists = await q.query<{ t: string | null }>(
        `SELECT to_regclass('os_analytics_internal.catalog_versions')::text AS t`,
      )
      if (!exists.rows[0]?.t) return null
      const r = await q.query<LatestVersion>(
        `SELECT version, hash, catalog FROM os_analytics_internal.catalog_versions
          ORDER BY version DESC, created_at DESC LIMIT 1`,
      )
      return r.rows[0] ?? null
    } catch (err) {
      // The app role reads catalog_versions only once a provision granted it.
      if ((err as { code?: string }).code === '42501') return null
      throw err
    }
  }

  private async versionCatalog(
    q: Pool | PoolClient,
    version: number,
  ): Promise<CatalogVersion | null> {
    if (version < 1) return null
    const r = await q.query<{ catalog: CatalogVersion['catalog'] }>(
      `SELECT catalog FROM os_analytics_internal.catalog_versions
        WHERE version = $1 ORDER BY created_at DESC LIMIT 1`,
      [version],
    )
    return r.rows[0] ? { version, catalog: r.rows[0].catalog } : null
  }

  /** The version the current catalog deploys as, and what it keeps. */
  private async plan(q: Pool | PoolClient) {
    const latest = await this.latest(q)
    if (!latest) {
      return {
        latest,
        version: 1,
        breaking: false,
        changes: [] as string[],
        retained: [] as CatalogVersion[],
      }
    }
    const diff = diffCatalogs(latest.catalog, this.catalog)
    const version = diff.breaking ? latest.version + 1 : latest.version
    const prev = diff.breaking
      ? { version: latest.version, catalog: latest.catalog }
      : await this.versionCatalog(q, latest.version - 1)
    return {
      latest,
      version,
      breaking: diff.breaking,
      changes: [...diff.breakingChanges, ...diff.additiveChanges],
      retained: prev ? [prev] : [],
    }
  }

  // ── Status / provisioning ──────────────────────────────────────────────

  async status(): Promise<AnalyticsStatus> {
    const base = {
      catalogHash: this.catalog.hash,
      readHost: this.readHost,
      schemas: { masked: ALIAS_SCHEMA, pii: ALIAS_PII_SCHEMA },
    }
    if (this.backend !== 'postgres') {
      return {
        backend: 'sqlite',
        mode: this.mode,
        provisioned: false,
        version: null,
        hash: null,
        upToDate: false,
        database: null,
        pgcrypto: null,
        warnings: [],
        ...base,
      }
    }
    const q = this.mode === 'managed' ? this.admin() : this.main()
    const latest = await this.latest(q)
    const db = await this.main().query<{ db: string; pgcrypto: boolean }>(
      `SELECT current_database()::text AS db,
              EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') AS pgcrypto`,
    )
    const warnings = latest ? await this.warnings() : []
    return {
      backend: 'postgres',
      mode: this.mode,
      provisioned: latest !== null,
      version: latest?.version ?? null,
      hash: latest?.hash ?? null,
      upToDate: latest?.hash === this.catalog.hash,
      database: db.rows[0]!.db,
      pgcrypto: db.rows[0]!.pgcrypto,
      warnings,
      ...base,
    }
  }

  private async warnings(): Promise<string[]> {
    const { reader } = roleNames(this.prefix)
    const out: string[] = []
    const r = await this.main().query<{ create_public: boolean | null; pgcrypto: boolean }>(
      `SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)
                   THEN has_schema_privilege($1, 'public', 'CREATE') END AS create_public,
              EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') AS pgcrypto`,
      [reader],
    )
    if (r.rows[0]?.create_public) {
      out.push(
        'SQL principals can CREATE in schema public (PUBLIC holds CREATE there, the default before Postgres 15). ' +
          'Run `REVOKE CREATE ON SCHEMA public FROM PUBLIC` as its owner.',
      )
    }
    if (r.rows[0] && !r.rows[0].pgcrypto) {
      out.push('pgcrypto is not installed: hmac-masked columns render as [REDACTED].')
    }
    return out
  }

  /** The standalone script (BEGIN … COMMIT) for an operator to run by hand. */
  async provisionScript(): Promise<string> {
    this.requirePostgres()
    const q = this.mode === 'managed' ? this.admin() : this.main()
    const [tables, appRole, plan] = await Promise.all([
      this.baseTables(),
      this.appRole(),
      this.plan(q),
    ])
    const script = generateProvisionScript({
      prefix: this.prefix,
      version: plan.version,
      catalog: this.catalog,
      retained: plan.retained,
      tables,
      appRole,
      standalone: true,
    })
    return (
      script +
      `-- The hmac mask key is not part of this script (it is derived from STORE_SECRET).\n` +
      `-- Until a managed provision stores it, hmac-masked columns render as [REDACTED].\n`
    )
  }

  /**
   * Provision (managed mode). `onlyIfChanged` is the boot path: after taking
   * the lock, do nothing when the deployed hash already matches.
   */
  async provision(opts: { onlyIfChanged?: boolean } = {}): Promise<ProvisionResult> {
    this.requirePostgres()
    const pool = this.admin()
    const [tables, appRole] = await Promise.all([this.baseTables(), this.appRole()])
    const client = await pool.connect()
    let result: ProvisionResult
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [ADVISORY_LOCK_KEY])
      const plan = await this.plan(client)
      const same = plan.latest?.hash === this.catalog.hash
      if (opts.onlyIfChanged && same) {
        await client.query('ROLLBACK')
        return {
          changed: false,
          version: plan.version,
          hash: this.catalog.hash,
          breaking: false,
          changes: [],
          warnings: await this.warnings(),
        }
      }
      await client.query(
        generateProvisionScript({
          prefix: this.prefix,
          version: plan.version,
          catalog: this.catalog,
          retained: plan.retained,
          tables,
          appRole,
        }),
      )
      await client.query(
        `INSERT INTO os_analytics_internal.mask_key (id, key) VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET key = EXCLUDED.key`,
        [deriveMaskKey(this.opts.storeSecret)],
      )
      await client.query('COMMIT')
      result = {
        changed: !same,
        version: plan.version,
        hash: this.catalog.hash,
        breaking: plan.breaking,
        changes: plan.changes,
        warnings: [],
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
    result.warnings = await this.warnings()
    return result
  }

  /** Boot hook: re-provision when the catalog changed. Never throws. */
  async provisionOnBoot(): Promise<void> {
    if (this.backend !== 'postgres' || this.mode !== 'managed') return
    try {
      const r = await this.provision({ onlyIfChanged: true })
      if (r.changed) {
        this.log?.info(
          `analytics: provisioned SQL views version ${r.version} (${r.breaking ? 'breaking' : 'additive'} change, catalog ${r.hash.slice(0, 12)})`,
        )
      }
      for (const w of r.warnings) this.log?.warn({}, `analytics: ${w}`)
    } catch (err) {
      this.log?.warn({ err }, 'analytics: boot provisioning failed; SQL views may be stale')
    }
  }

  private async requireProvisioned(): Promise<void> {
    const q = this.mode === 'managed' ? this.admin() : this.main()
    if (!(await this.latest(q))) {
      throw new AnalyticsError(
        409,
        'NOT_PROVISIONED',
        'Provision SQL access before creating principals.',
      )
    }
  }

  /** Run statements in one admin transaction (managed), or render them as a script (manual). */
  private async runOrScript(statements: string[]): Promise<string | undefined> {
    if (this.mode === 'manual') {
      return ['BEGIN;', ...statements, 'COMMIT;', ''].join('\n')
    }
    const client = await this.admin().connect()
    try {
      await client.query('BEGIN')
      for (const s of statements) await client.query(s)
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
    return undefined
  }

  /** Best effort: needs pg_signal_backend or membership in the role. */
  private async terminate(roleName: string): Promise<number | null> {
    if (this.mode !== 'managed') return null
    try {
      const r = await this.admin().query(terminateSessionsStatement(roleName))
      return r.rowCount ?? 0
    } catch (err) {
      this.log?.warn({ err }, `analytics: could not terminate sessions of ${roleName}`)
      return null
    }
  }

  // ── Principals ─────────────────────────────────────────────────────────

  async listPrincipals(): Promise<PrincipalRecord[]> {
    return this.principals().list()
  }

  async getPrincipal(id: string): Promise<PrincipalRecord | null> {
    return this.principals().get(id)
  }

  async createPrincipal(input: CreatePrincipalInput): Promise<PrincipalSecretResult> {
    const store = this.principals()
    await this.requireProvisioned()
    const roleName = principalRoleName(this.prefix, input.label)
    const password = generatePassword()
    const statements = createPrincipalStatements({
      prefix: this.prefix,
      roleName,
      passwordVerifier: scramVerifier(password),
      pii: input.pii,
      connectionLimit: input.connectionLimit,
      validUntil: input.expiresAt === null ? null : new Date(input.expiresAt),
      scope: input.scope,
    })
    const script = await this.runOrScript(statements)
    const record = {
      roleName,
      label: input.label,
      pii: input.pii,
      scope: input.scope,
      connectionLimit: input.connectionLimit,
      createdBy: input.createdBy,
      createdAt: Date.now(),
      expiresAt: input.expiresAt,
      revokedAt: null,
      lastRotatedAt: null,
    }
    let principal: PrincipalRecord
    try {
      principal = await store.insert(record)
    } catch (err) {
      // The login exists but nothing records it: take it away again.
      if (this.mode === 'managed') {
        await this.runOrScript(revokePrincipalStatements(this.prefix, roleName)).catch(() => {})
      }
      throw err
    }
    return script ? { principal, password, script } : { principal, password }
  }

  async rotatePrincipal(p: PrincipalRecord): Promise<PrincipalSecretResult> {
    if (p.revokedAt !== null)
      throw new AnalyticsError(409, 'PRINCIPAL_REVOKED', 'The principal is revoked.')
    const password = generatePassword()
    const script = await this.runOrScript(
      rotatePrincipalStatements(p.roleName, scramVerifier(password)),
    )
    const sessionsTerminated = await this.terminate(p.roleName)
    const at = Date.now()
    await this.principals().markRotated(p.id, at)
    const principal = { ...p, lastRotatedAt: at }
    return script
      ? { principal, password, script: script + terminateSessionsStatement(p.roleName) + '\n' }
      : { principal, password, sessionsTerminated }
  }

  async revokePrincipal(
    p: PrincipalRecord,
  ): Promise<{ principal: PrincipalRecord; script?: string; sessionsTerminated?: number | null }> {
    if (p.revokedAt !== null) return { principal: p }
    const script = await this.runOrScript(revokePrincipalStatements(this.prefix, p.roleName))
    const sessionsTerminated = await this.terminate(p.roleName)
    const at = Date.now()
    await this.principals().markRevoked(p.id, at)
    const principal = { ...p, revokedAt: at }
    return script
      ? { principal, script: script + terminateSessionsStatement(p.roleName) + '\n' }
      : { principal, sessionsTerminated }
  }
}
