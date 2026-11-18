/**
 * Read-only SQL access against a real Postgres — the security properties the
 * design rests on, checked by logging in as the principals it mints:
 *
 *   - a tenant-scoped principal sees only its tenant's rows, PII masked
 *     exactly as `mask.ts` masks it (whole-record parity with applyMasking);
 *   - the base tables, the internal tables and the unmasked schema are
 *     permission-denied; writes through a view fail even with the read-only
 *     default turned off;
 *   - an all-tenant principal sees every tenant; a PII principal sees clear
 *     values; a vertical-scoped principal sees nothing outside its vertical;
 *   - rotation invalidates the old password and ends open sessions; revocation
 *     blocks login and strips an open session of its access;
 *   - a breaking catalog change bumps the version and keeps the previous one.
 *
 * Runs in its own throwaway database, as a non-superuser app role with
 * CREATEROLE (the realistic managed setup), with a random role prefix — roles
 * are cluster-global — and drops all of it afterwards. Skipped unless
 * TEST_DATABASE_URL is set (a superuser URL, e.g.
 * postgres://postgres@localhost:5432/opensteward_test).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import {
  CredentialStore,
  ResourceStore,
  SyncStore,
  applyMasking,
  deriveMaskKey,
  maskValue,
  openDb,
  type DbHandle,
  type MaskKind,
} from '@opensteward/shared'
import { AnalyticsService } from '../../src/analytics/provisioner'
import { getClassification } from '../../src/data-access/classification-registry'
import type { AnalyticsCatalog } from '../../src/analytics/view-catalog'
import { catalogHash } from '../../src/analytics/view-catalog'

const BASE_URL = process.env['TEST_DATABASE_URL']
const STORE_SECRET = 'analytics-it-store-secret-0123456789abcdef'
const RUN = randomBytes(3).toString('hex')
const PREFIX = `ost${RUN}`
const DB_NAME = `os_analytics_it_${RUN}`
const APP_ROLE = `${PREFIX}_app`
const APP_PASSWORD = `app-${RUN}-${randomBytes(8).toString('hex')}`

function urlFor(user: string, password: string | null, db = DB_NAME): string {
  const u = new URL(BASE_URL!)
  u.username = user
  u.password = password ?? ''
  u.pathname = `/${db}`
  return u.toString()
}

async function connect(url: string): Promise<Client> {
  const c = new Client({ connectionString: url })
  await c.connect()
  c.on('error', () => {}) // a terminated session emits here; the test asserts on the query
  return c
}

async function tryConnect(
  url: string,
): Promise<{ ok: true; client: Client } | { ok: false; err: Error & { code?: string } }> {
  try {
    return { ok: true, client: await connect(url) }
  } catch (err) {
    return { ok: false, err: err as Error & { code?: string } }
  }
}

async function expectDenied(c: Client, sql: string, code = '42501') {
  await expect(c.query(sql)).rejects.toMatchObject({ code })
}

const JANE = {
  id: 'cont_jane',
  first_name: 'Jane',
  last_name: 'Doe',
  name: 'Jane Doe',
  email: 'jane.doe@acme.example',
  phone: '+1 (415) 555-0123',
  title: 'Head of Finance',
  tags: ['vip'],
  address: { line1: '1 Main St', city: 'Springfield', postal_code: '12345', country: 'US' },
  created_at: '2026-01-15T09:30:00Z',
  metadata: { upstream: { secret_note: 'x' } },
}
const BOB = { id: 'cont_bob', name: 'Bob Stone', email: 'bob@globex.example', metadata: {} }
const ORPHAN = { id: 'cont_orphan', name: 'No Owner', email: 'nobody@example.com', metadata: {} }

describe.skipIf(!BASE_URL)('read-only SQL access (Postgres)', () => {
  let superuser: Client
  let handle: DbHandle
  let svc: AnalyticsService
  let authEnforced = false
  let c1: string
  let cp: string
  const cleanup: Client[] = []
  const login = async (username: string, password: string) => {
    const c = await connect(urlFor(username, password))
    cleanup.push(c)
    return c
  }

  beforeAll(async () => {
    superuser = await connect(BASE_URL!)
    await superuser.query(`CREATE ROLE "${APP_ROLE}" LOGIN CREATEROLE PASSWORD '${APP_PASSWORD}'`)
    await superuser.query(`CREATE DATABASE "${DB_NAME}" OWNER "${APP_ROLE}"`)
    // On Postgres < 15 PUBLIC may CREATE in public; the warning path is checked below.
    const appUrl = urlFor(APP_ROLE, APP_PASSWORD)

    handle = await openDb({ databaseUrl: appUrl, poolMax: 4 })
    const creds = await CredentialStore.create(handle, STORE_SECRET)
    const resources = await ResourceStore.create(handle)
    const sync = await SyncStore.create(handle)
    await handle.execScript(`
      CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
      INSERT INTO tenants VALUES ('t1', 'Acme', 1700000000000, 1700000000000), ('t2', 'Globex', 1700000000000, 1700000000000);
    `)
    c1 = await creds.create('hubspot', null, { accessToken: 'tok-1' }, 'Acme CRM', 'crm', 't1')
    const c2 = await creds.create(
      'hubspot',
      null,
      { accessToken: 'tok-2' },
      'Globex CRM',
      'crm',
      't2',
    )
    const c0 = await creds.create(
      'pipedrive',
      null,
      { accessToken: 'tok-0' },
      'Orphan',
      'crm',
      null,
    )
    cp = await creds.create('stripe', null, { accessToken: 'tok-p' }, 'Acme pay', 'payments', 't1')
    await resources.upsert('crm', 'hubspot', c1, 'contacts', JANE.id, JANE)
    await resources.upsert('crm', 'hubspot', c2, 'contacts', BOB.id, BOB)
    await resources.upsert('crm', 'pipedrive', c0, 'contacts', ORPHAN.id, ORPHAN)
    await resources.upsert('payments', 'stripe', cp, 'charges', 'ch_1', {
      id: 'ch_1',
      amount: 1250,
      currency: 'USD',
      status: 'succeeded',
      raw: { card: { iban: 'DE89370400440532013000' } },
      metadata: {},
    })
    await sync.create('crm', c1, 'hubspot', null, null)
    await sync.create('crm', c2, 'hubspot', null, null)

    svc = await AnalyticsService.create({
      dialect: 'postgres',
      databaseUrl: appUrl,
      handle,
      storeSecret: STORE_SECRET,
      config: { adminDatabaseUrl: appUrl, rolePrefix: PREFIX, readHost: 'replica.internal' },
    })

    // Does the server check passwords at all? (Local dev clusters often trust.)
    const probe = await tryConnect(urlFor(APP_ROLE, 'definitely-wrong'))
    authEnforced = !probe.ok
    if (probe.ok) await probe.client.end()
  }, 120_000)

  afterAll(async () => {
    for (const c of cleanup) await c.end().catch(() => {})
    await svc?.close()
    await handle?.close()
    if (superuser) {
      // Let the pools' own disconnects land first; FORCE only for stragglers
      // (forcing an ending client makes it emit an error nobody listens to).
      for (let i = 0; i < 50; i++) {
        const r = await superuser.query(
          `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1`,
          [DB_NAME],
        )
        if (r.rows[0].n === 0) break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      await superuser.query(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`)
      const roles = await superuser.query<{ rolname: string }>(
        `SELECT rolname FROM pg_roles WHERE rolname LIKE $1 ORDER BY rolname <> $2, rolname DESC`,
        [`${PREFIX}\\_%`, APP_ROLE],
      )
      // Principals and group roles first, the app role (their creator) last.
      for (const { rolname } of [...roles.rows].reverse()) {
        await superuser.query(`DROP ROLE IF EXISTS "${rolname}"`)
      }
      await superuser.end()
    }
  }, 60_000)

  it('reports unprovisioned, then provisions version 1', async () => {
    const before = await svc.status()
    expect(before).toMatchObject({
      backend: 'postgres',
      mode: 'managed',
      provisioned: false,
      readHost: 'replica.internal',
    })

    const r = await svc.provision()
    expect(r).toMatchObject({ changed: true, version: 1, hash: svc.catalog.hash, breaking: false })

    const after = await svc.status()
    expect(after).toMatchObject({
      provisioned: true,
      version: 1,
      hash: svc.catalog.hash,
      upToDate: true,
      pgcrypto: true,
    })

    // Boot path: nothing to do when the hash matches.
    expect(await svc.provision({ onlyIfChanged: true })).toMatchObject({
      changed: false,
      version: 1,
    })
  }, 120_000)

  it('SQL masks equal mask.ts for sample values', async () => {
    const key = deriveMaskKey(STORE_SECRET)
    const samples: Array<[unknown, MaskKind]> = [
      ['jane.doe@acme.example', 'email'],
      ['a@b@c.example', 'email'],
      ['@nolocal.example', 'email'],
      ['no-at-sign', 'email'],
      ['', 'email'],
      [['x@y.example', null, 'z@w.example'], 'email'],
      [42, 'email'],
      ['+1 (415) 555-0123', 'phone'],
      ['12', 'phone'],
      ['7', 'phone'],
      [4155550123, 'phone'],
      ['Jane  Ann Doe', 'name'],
      ['  leading space', 'name'],
      ['Élodie Ünal', 'name'],
      ['', 'name'],
      [
        {
          line1: '1 Main',
          city: 'X',
          country: 'US',
          countryCode: 'US',
          zip: null,
          geo: { lat: 1, lng: 2 },
          lines: ['a', 'b'],
        },
        'address',
      ],
      ['1 Main St', 'address'],
      [[{ street: 's', Country: 'SE' }], 'address'],
      [{ nested: { deep: true } }, 'redact'],
      ['secret', 'redact'],
      ['123-45-6789', 'hmac'],
      [123456789, 'hmac'],
      [true, 'hmac'],
      [null, 'email'],
    ]
    const app = await login(APP_ROLE, APP_PASSWORD)
    for (const [value, kind] of samples) {
      const r = await app.query<{ v: unknown }>(
        `SELECT os_analytics_internal.mask_value($1::jsonb, $2, $3) AS v`,
        [JSON.stringify(value), kind, key],
      )
      expect({ value, kind, sql: r.rows[0]!.v }).toEqual({
        value,
        kind,
        sql: maskValue(value, kind, key),
      })
    }
    // No key → hmac fails closed to redaction, as in mask.ts.
    const r = await app.query(`SELECT os_analytics_internal.mask_value('"x"', 'hmac', NULL) AS v`)
    expect(r.rows[0].v).toBe(maskValue('x', 'hmac'))
  })

  it('a tenant-scoped masked principal sees only its tenant, masked like applyMasking', async () => {
    const created = await svc.createPrincipal({
      label: 'Acme BI',
      pii: false,
      scope: { tenants: ['t1'] },
      expiresAt: null,
      connectionLimit: 3,
      createdBy: 'test',
    })
    expect(created.password).toMatch(/^[A-Za-z0-9]{40}$/)
    expect(created.principal.roleName).toMatch(new RegExp(`^${PREFIX}_sql_acme_bi_[0-9a-f]{6}$`))
    const c = await login(created.principal.roleName, created.password)

    const rows = (await c.query(`SELECT * FROM crm_contacts ORDER BY resource_id`)).rows
    expect(rows.map((r) => r.resource_id)).toEqual([JANE.id])
    const jane = rows[0]
    expect(jane.connection_id).toBe(c1)
    expect(jane.owner_tenant_id).toBe('t1')
    expect(jane.email).toBe(maskValue(JANE.email, 'email'))
    expect(jane.email).toBe('j***@acme.example')
    expect(jane.first_name).toBe('J***')
    expect(jane.phone).toBe(maskValue(JANE.phone, 'phone'))
    expect(jane.address).toEqual(maskValue(JANE.address, 'address'))
    expect(jane.title).toBe(JANE.title)
    expect(jane.created_at).toEqual(new Date(JANE.created_at))
    expect(jane.metadata).toBe('[REDACTED]')
    const cls = getClassification('crm', 'contacts')!
    expect(jane.data).toEqual(applyMasking(JANE, cls, { hmacKey: deriveMaskKey(STORE_SECRET) }))

    const conns = (await c.query(`SELECT connection_id, owner_tenant_id FROM connections`)).rows
    expect(conns.map((r) => r.connection_id).sort()).toEqual([c1, cp].sort())
    expect(conns.every((r) => r.owner_tenant_id === 't1')).toBe(true)
    expect((await c.query(`SELECT tenant_id, name FROM tenants`)).rows).toEqual([
      { tenant_id: 't1', name: 'Acme' },
    ])
    expect((await c.query(`SELECT connection_id FROM sync_status`)).rows).toEqual([
      { connection_id: c1 },
    ])

    // The payments upstream payload never reaches SQL.
    const charge = (await c.query(`SELECT * FROM payments_charges`)).rows[0]
    expect(charge.amount).toBe('1250')
    expect(charge.data).not.toHaveProperty('raw')
    expect(Object.keys(charge)).not.toContain('raw')

    // Nothing else is reachable.
    await expectDenied(c, `SELECT * FROM public.resources`)
    await expectDenied(c, `SELECT * FROM public.credentials`)
    await expectDenied(c, `SELECT * FROM public.sync_jobs`)
    await expectDenied(c, `SELECT * FROM public.analytics_principals`)
    await expectDenied(c, `SELECT * FROM os_analytics_internal.mask_key`)
    await expectDenied(c, `SELECT * FROM os_analytics_internal.principal_scopes`)
    await expectDenied(c, `SELECT * FROM os_analytics_pii.crm_contacts`)
    await expectDenied(c, `SELECT * FROM os_analytics_pii_v1.crm_contacts`)

    // Writes: the views are not updatable, the session defaults to read-only,
    // and without that default the privileges still refuse every write.
    await expect(
      c.query(`INSERT INTO crm_contacts (resource_id) VALUES ('x')`),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/^(55000|42501|25006)$/),
    })
    await expect(c.query(`CREATE TEMP TABLE scratch (a int)`)).rejects.toMatchObject({
      code: '25006',
    })
    await c.query(`SET default_transaction_read_only = off`)
    await expect(c.query(`DELETE FROM connections`)).rejects.toBeTruthy()
    await expectDenied(
      c,
      `INSERT INTO os_analytics_internal.principal_all_scope VALUES (current_user, '*')`,
    )
    await expectDenied(c, `UPDATE os_analytics_internal.catalog_versions SET hash = 'x'`)
    await expectDenied(c, `CREATE TABLE os_analytics.x (a int)`)
    await expectDenied(
      c,
      `CREATE FUNCTION os_analytics_internal.evil() RETURNS int LANGUAGE sql AS 'SELECT 1'`,
    )

    // SET ROLE to the group role does not widen what the login sees.
    await c.query(`SET ROLE "${PREFIX}_analytics_reader"`)
    expect((await c.query(`SELECT count(*)::int AS n FROM crm_contacts`)).rows[0].n).toBe(1)
    await c.query(`RESET ROLE`)

    // Session settings the principal was created with.
    await c.query(`RESET default_transaction_read_only`)
    expect((await c.query(`SHOW statement_timeout`)).rows[0].statement_timeout).toBe('1min')
    expect((await c.query(`SHOW search_path`)).rows[0].search_path).toBe('os_analytics')
  })

  it('an all-tenant principal sees every tenant; a vertical-scoped one only its vertical', async () => {
    const all = await svc.createPrincipal({
      label: 'warehouse',
      pii: false,
      scope: { tenants: '*' },
      expiresAt: null,
      connectionLimit: 2,
      createdBy: null,
    })
    const c = await login(all.principal.roleName, all.password)
    const ids = (await c.query(`SELECT resource_id FROM crm_contacts ORDER BY resource_id`)).rows
    expect(ids.map((r) => r.resource_id)).toEqual([BOB.id, JANE.id, ORPHAN.id])
    expect(
      (await c.query(`SELECT tenant_id FROM tenants ORDER BY 1`)).rows.map((r) => r.tenant_id),
    ).toEqual(['t1', 't2'])

    const pay = await svc.createPrincipal({
      label: 'payments only',
      pii: false,
      scope: { tenants: ['t1'], verticals: ['payments'] },
      expiresAt: null,
      connectionLimit: 1,
      createdBy: null,
    })
    const p = await login(pay.principal.roleName, pay.password)
    expect((await p.query(`SELECT count(*)::int AS n FROM crm_contacts`)).rows[0].n).toBe(0)
    expect((await p.query(`SELECT count(*)::int AS n FROM payments_charges`)).rows[0].n).toBe(1)
  })

  it('a PII principal sees unmasked values (secrets still removed)', async () => {
    const pii = await svc.createPrincipal({
      label: 'dwh pii',
      pii: true,
      scope: { tenants: ['t2'] },
      expiresAt: null,
      connectionLimit: 1,
      createdBy: null,
    })
    const c = await login(pii.principal.roleName, pii.password)
    const rows = (await c.query(`SELECT resource_id, email, name, data FROM crm_contacts`)).rows
    expect(rows).toEqual([{ resource_id: BOB.id, email: BOB.email, name: BOB.name, data: BOB }])
    await expectDenied(c, `SELECT * FROM os_analytics.crm_contacts`)
  })

  it('rotation invalidates the old password and ends open sessions', async () => {
    const created = await svc.createPrincipal({
      label: 'rotate me',
      pii: false,
      scope: { tenants: ['t1'] },
      expiresAt: null,
      connectionLimit: 3,
      createdBy: null,
    })
    const role = created.principal.roleName
    const open = await login(role, created.password)
    const before = await superuser.query(`SELECT rolpassword FROM pg_authid WHERE rolname = $1`, [
      role,
    ])

    const rotated = await svc.rotatePrincipal(created.principal)
    expect(rotated.password).not.toBe(created.password)
    expect(rotated.sessionsTerminated).toBe(1)
    await expect(open.query('SELECT 1')).rejects.toBeTruthy()

    const after = await superuser.query(`SELECT rolpassword FROM pg_authid WHERE rolname = $1`, [
      role,
    ])
    expect(after.rows[0].rolpassword).not.toBe(before.rows[0].rolpassword)
    expect(after.rows[0].rolpassword).toMatch(/^SCRAM-SHA-256\$4096:/)

    const fresh = await login(role, rotated.password)
    expect((await fresh.query(`SELECT count(*)::int AS n FROM crm_contacts`)).rows[0].n).toBe(1)
    if (authEnforced) {
      const old = await tryConnect(urlFor(role, created.password))
      expect(old.ok).toBe(false)
      if (!old.ok) expect(old.err.code).toBe('28P01')
    }
  })

  it('revocation blocks login and strips an open session of access', async () => {
    const created = await svc.createPrincipal({
      label: 'revoke me',
      pii: false,
      scope: { tenants: ['t1'] },
      expiresAt: Date.now() + 86_400_000,
      connectionLimit: 3,
      createdBy: null,
    })
    const role = created.principal.roleName
    const open = await login(role, created.password)
    expect((await open.query(`SELECT count(*)::int AS n FROM crm_contacts`)).rows[0].n).toBe(1)

    const r = await svc.revokePrincipal(created.principal)
    expect(r.principal.revokedAt).not.toBeNull()
    expect(r.sessionsTerminated).toBe(1)
    await expect(open.query(`SELECT count(*) FROM crm_contacts`)).rejects.toBeTruthy()

    const again = await tryConnect(urlFor(role, created.password))
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.err.code).toBe('28000')

    const meta = await svc.getPrincipal(created.principal.id)
    expect(meta?.revokedAt).not.toBeNull()
    // Idempotent.
    expect((await svc.revokePrincipal(meta!)).principal.revokedAt).toBe(meta!.revokedAt)
    const scopes = await (
      await login(APP_ROLE, APP_PASSWORD)
    ).query(
      `SELECT count(*)::int AS n FROM os_analytics_internal.principal_scopes WHERE role_name = $1`,
      [role],
    )
    expect(scopes.rows[0].n).toBe(0)
  })

  it('a breaking catalog change bumps the version and keeps the previous one', async () => {
    const trimmed: AnalyticsCatalog = JSON.parse(JSON.stringify(svc.catalog))
    const contacts = trimmed.views.find((v) => v.name === 'crm_contacts')!
    contacts.columns = contacts.columns.filter((c) => c.name !== 'title')
    trimmed.hash = catalogHash(trimmed.views)
    const appUrl = urlFor(APP_ROLE, APP_PASSWORD)
    const v2 = await AnalyticsService.create({
      dialect: 'postgres',
      databaseUrl: appUrl,
      handle,
      storeSecret: STORE_SECRET,
      catalog: trimmed,
      config: { adminDatabaseUrl: appUrl, rolePrefix: PREFIX },
    })
    try {
      const r = await v2.provision({ onlyIfChanged: true })
      expect(r).toMatchObject({ changed: true, version: 2, breaking: true })
      expect(r.changes).toContain('column crm_contacts.title removed')
    } finally {
      await v2.close()
    }

    const all = await svc.createPrincipal({
      label: 'versions',
      pii: false,
      scope: { tenants: '*' },
      expiresAt: null,
      connectionLimit: 2,
      createdBy: null,
    })
    const c = await login(all.principal.roleName, all.password)
    await expect(c.query(`SELECT title FROM crm_contacts`)).rejects.toMatchObject({ code: '42703' })
    const v1 = await c.query(
      `SELECT title FROM os_analytics_v1.crm_contacts WHERE title IS NOT NULL`,
    )
    expect(v1.rows).toEqual([{ title: JANE.title }])

    // Putting the column back is additive: rebuilt in place as version 2.
    const back = await svc.provision({ onlyIfChanged: true })
    expect(back).toMatchObject({ changed: true, version: 2, breaking: false })
    expect(back.changes).toContain('column crm_contacts.title added')
    const c2 = await login(all.principal.roleName, all.password)
    expect((await c2.query(`SELECT title FROM crm_contacts WHERE title IS NOT NULL`)).rows).toEqual(
      [{ title: JANE.title }],
    )
    expect((await svc.status()).version).toBe(2)
  }, 120_000)

  it('manual mode generates the SQL instead of running it', async () => {
    const appUrl = urlFor(APP_ROLE, APP_PASSWORD)
    const manual = await AnalyticsService.create({
      dialect: 'postgres',
      databaseUrl: appUrl,
      handle,
      storeSecret: STORE_SECRET,
      config: { rolePrefix: PREFIX },
    })
    try {
      expect(manual.mode).toBe('manual')
      const script = await manual.provisionScript()
      expect(script).toMatch(/^-- OpenSteward read-only SQL access/)
      expect(script).toMatch(/^BEGIN;$/m)
      expect(script).toMatch(/^COMMIT;$/m)
      expect(script).toContain(
        `GRANT SELECT ON os_analytics_internal.catalog_versions TO "${APP_ROLE}"`,
      )

      const created = await manual.createPrincipal({
        label: 'manual',
        pii: false,
        scope: { tenants: ['t1'] },
        expiresAt: null,
        connectionLimit: 1,
        createdBy: null,
      })
      expect(created.script).toBeDefined()
      expect(created.script).not.toContain(created.password)
      // Nothing ran yet …
      expect((await tryConnect(urlFor(created.principal.roleName, created.password))).ok).toBe(
        false,
      )
      // … until an operator runs the script.
      const admin = await login(APP_ROLE, APP_PASSWORD)
      await admin.query(created.script!)
      const c = await login(created.principal.roleName, created.password)
      expect((await c.query(`SELECT count(*)::int AS n FROM crm_contacts`)).rows[0].n).toBe(1)
    } finally {
      await manual.close()
    }
  })
})
