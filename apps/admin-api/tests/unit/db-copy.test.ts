/**
 * db-copy with admin-api's real profile (dist/db-copy.js in the image):
 * admin.db ⇄ Postgres. Writes through the real stores, copies, and reads back
 * through them on the target — users, tenants and their domains (a foreign
 * key), logo bytes (BLOB ⇄ BYTEA), the audit log (AUTOINCREMENT ⇄ GENERATED
 * ALWAYS AS IDENTITY: a new entry after the copy gets a fresh id), and the
 * seed rows the migrations insert (the 'default' tenant, built-in roles).
 *
 * SQLite → SQLite always; the Postgres directions with TEST_DATABASE_URL,
 * each Postgres side in a throwaway schema (never `public`, which this
 * workspace's other suites drop per file).
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { openDb, type DbHandle } from '@opensteward/shared'
import {
  callsReceiving,
  copyDatabase,
  recordProfile,
  type Endpoint,
} from '@opensteward/shared/db-copy'
import { ADMIN_DB_PROFILE } from '../../src/db-copy'
import { AdminStore } from '../../src/core/db/admin-store'
import { LogoStore } from '../../src/core/db/logo-store'
import { UserAvatarStore } from '../../src/core/db/user-avatar-store'

const PG = process.env.TEST_DATABASE_URL
type Kind = 'sqlite' | 'postgres'
const DIRECTIONS: Array<[Kind, Kind]> = [['sqlite', 'sqlite']]
if (PG) DIRECTIONS.push(['sqlite', 'postgres'], ['postgres', 'sqlite'])

const dir = mkdtempSync(join(tmpdir(), 'admin-db-copy-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

interface Side {
  endpoint: Endpoint
  open(): Promise<DbHandle>
  cleanup(): Promise<void>
}
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

async function onPg(sql: string): Promise<void> {
  const h = await openDb({ databaseUrl: PG, poolMax: 1 })
  try {
    await h.execScript(sql)
  } finally {
    await h.close()
  }
}

async function side(kind: Kind): Promise<Side> {
  if (kind === 'sqlite') {
    const path = join(dir, `${randomBytes(6).toString('hex')}.db`)
    return {
      endpoint: { kind: 'sqlite', path },
      open: () => openDb({ sqlitePath: path }),
      cleanup: () => Promise.resolve(),
    }
  }
  const schema = `dbcopy_${randomBytes(6).toString('hex')}`
  await onPg(`CREATE SCHEMA ${schema}`)
  cleanups.push(() => onPg(`DROP SCHEMA IF EXISTS ${schema} CASCADE`))
  const u = new URL(PG!)
  u.searchParams.set('options', `-c search_path=${schema}`)
  const url = u.toString()
  return {
    endpoint: { kind: 'postgres', url },
    open: () => openDb({ databaseUrl: url, poolMax: 2 }),
    cleanup: () => Promise.resolve(),
  }
}

// Every byte value, so a text round trip anywhere would show.
const AVATAR = Buffer.from(Array.from({ length: 256 }, (_, i) => i))
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x00, 0x7f])

describe('ADMIN_DB_PROFILE', () => {
  it('opens every store buildServer() hands the admin handle', () => {
    // Drift net: anything in core/server.ts that is handed the database handle
    // — positionally, in an object literal, or to a constructor — is a store
    // the profile must open (none is excluded today), or a Postgres → SQLite
    // copy would silently leave its tables behind.
    const server = readFileSync(resolve(__dirname, '../../src/core/server.ts'), 'utf8')
    const profile = readFileSync(resolve(__dirname, '../../src/db-copy.ts'), 'utf8')
    const booted = callsReceiving(server, 'handle')
    expect(booted.length).toBeGreaterThan(0)
    expect(callsReceiving(profile, 'handle')).toEqual(booted)
  })

  it('records the admin_store and identity_store namespaces and their tables', async () => {
    const rec = await recordProfile(ADMIN_DB_PROFILE)
    expect(rec.namespaces.map((n) => n.namespace)).toEqual(['admin_store', 'identity_store'])
    expect(rec.tables).toEqual(
      expect.arrayContaining([
        'users',
        'tenants',
        'tenant_domains',
        'audit_log',
        'platform_logos',
        'roles',
      ]),
    )
    // A fresh admin database is not empty: the migrations seed the 'default'
    // tenant and the built-in roles, and boot seeds runtime-setting defaults.
    expect(rec.seedCounts['tenants']).toBe(1)
    expect(rec.seedCounts['roles']).toBe(3)
  })
})

describe.each(DIRECTIONS)('admin db-copy %s → %s', (fromKind, toKind) => {
  it('copies the admin database so admin-api can use it', async () => {
    const from = await side(fromKind)
    const to = await side(toKind)

    const h = await from.open()
    let userId: string
    let lastAuditId: number
    try {
      // Boot-equivalent: every store the service opens, so the source is at
      // this build's schema (the copy refuses one that is not).
      await ADMIN_DB_PROFILE.open(h)
      const admin = await AdminStore.create(h)
      const logos = await LogoStore.create(h)
      userId = (await admin.createUser('ops', 'argon2-hash-never-printed', 'admin')).id
      await admin.createTenant('acme', 'Acme')
      await admin.addDomain('acme.example.com', 'acme')
      for (const n of [1, 2, 3])
        await admin.writeAudit(userId, 'company_info.update', null, `before-copy-${n}`, { n })
      await admin.createScopeGroup({
        vertical: 'crm',
        platform: 'hubspot',
        name: 'read',
        scopes: ['a', 'b'],
      })
      // admin_store v7: user_avatars.bytes is BLOB on SQLite, BYTEA on Postgres.
      await UserAvatarStore.for(admin).put({
        userId,
        contentType: 'image/png',
        bytes: AVATAR,
        source: 'upload',
        updatedBy: null,
      })
      await logos.putLogo({
        slug: 'acme',
        ext: 'png',
        contentType: 'image/png',
        bytes: PNG,
        sourceDomain: 'acme.example.com',
        fetchedBy: null,
      })
      const audit = await admin.listAudit(100, 0)
      lastAuditId = Math.max(...audit.map((a) => a.id))
    } finally {
      await h.close()
    }

    const lines: string[] = []
    const report = await copyDatabase({
      profile: ADMIN_DB_PROFILE,
      from: from.endpoint,
      to: to.endpoint,
      log: (l) => lines.push(l),
    })
    expect(report.tables.find((t) => t.table === 'users')?.copied).toBe(1)
    // tenant_domains references tenants: parents are copied first.
    const order = report.tables.map((t) => t.table)
    expect(order.indexOf('tenants')).toBeLessThan(order.indexOf('tenant_domains'))
    expect(lines.join('\n')).not.toContain('argon2-hash-never-printed')

    const t = await to.open()
    try {
      const admin = await AdminStore.create(t)
      const logos = await LogoStore.create(t)
      expect((await admin.getUserByUsername('ops'))?.id).toBe(userId)
      expect((await admin.listTenants()).map((x) => x.id).sort()).toEqual(['acme', 'default'])
      expect(await admin.listDomainMap()).toEqual([
        { domain: 'acme.example.com', tenantId: 'acme' },
      ])
      expect((await admin.listRoles()).map((r) => r.id).sort()).toEqual([
        'admin',
        'operator',
        'viewer',
      ])
      expect((await admin.listScopeGroups())[0]?.scopes).toEqual(['a', 'b'])
      const logo = await logos.getLogo('acme', 'png')
      expect(Buffer.compare(logo!.bytes, PNG)).toBe(0)
      const avatar = await UserAvatarStore.for(admin).get(userId)
      expect(avatar!.byteSize).toBe(256)
      expect(Buffer.compare(avatar!.bytes, AVATAR)).toBe(0)
      // The audit log keeps its ids, and the next entry gets a fresh one.
      const before = await admin.listAudit(100, 0)
      expect(Math.max(...before.map((a) => a.id))).toBe(lastAuditId)
      await admin.writeAudit(userId, 'company_info.update', null, 'after-copy', {})
      const after = await admin.listAudit(100, 0)
      const fresh = after.find((a) => a.target_id === 'after-copy')!
      expect(fresh.id).toBeGreaterThan(lastAuditId)
    } finally {
      await t.close()
    }
    if (toKind === 'sqlite') expect(existsSync((to.endpoint as { path: string }).path)).toBe(true)
  })
})
