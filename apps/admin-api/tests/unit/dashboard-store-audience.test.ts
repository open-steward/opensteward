import { afterEach, describe, expect, it } from 'vitest'
import { openDb, type DbHandle } from '@opensteward/shared'
import { AdminStore, MIGRATIONS } from '../../src/core/db/admin-store'
import { DashboardStore } from '../../src/core/db/dashboard-store'

const PG_URL = process.env['ADMIN_STORE_PG_URL']
const DIALECTS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
  ...(PG_URL ? [{ name: 'postgres', open: () => openDb({ databaseUrl: PG_URL }) }] : []),
]

/** A fresh database: Postgres tests share one server, so wipe the schema first. */
async function fresh(open: () => Promise<DbHandle>): Promise<DbHandle> {
  const h = await open()
  if (h.dialect === 'postgres') await h.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  return h
}

let handle: DbHandle | undefined
afterEach(async () => {
  await handle?.close()
  handle = undefined
})

for (const dialect of DIALECTS) {
  describe(`dashboard audiences (${dialect.name})`, () => {
    it('round-trips every audience and pins', async () => {
      handle = await fresh(dialect.open)
      await AdminStore.create(handle)
      const store = await DashboardStore.create(handle)
      const base = { name: 'd', description: null, widgets: [], ownerUserId: 'u1' }
      const p = await store.create({ ...base, audience: { kind: 'private' }, pinnedTenants: null })
      const t = await store.create({
        ...base,
        audience: { kind: 'tenants', tenants: ['globex', 'acme', 'acme'] },
        pinnedTenants: ['acme'],
      })
      const e = await store.create({ ...base, audience: { kind: 'everyone' }, pinnedTenants: [] })
      expect(p).toMatchObject({ audience: { kind: 'private' }, pinnedTenants: null })
      expect(t).toMatchObject({
        audience: { kind: 'tenants', tenants: ['acme', 'globex'] },
        pinnedTenants: ['acme'],
      })
      expect(e).toMatchObject({ audience: { kind: 'everyone' }, pinnedTenants: null })
      const moved = await store.update(t.id, { audience: { kind: 'everyone' }, pinnedTenants: null })
      expect(moved).toMatchObject({ audience: { kind: 'everyone' }, pinnedTenants: null })
      expect((await store.listAll()).map((d) => d.id).sort()).toEqual([p.id, t.id, e.id].sort())
    })

    it('v6 turns shared dashboards into everyone, or into the restricted owner’s tenants', async () => {
      handle = await fresh(dialect.open)
      await handle.migrate('admin_store', MIGRATIONS.filter((m) => m.version <= 5))
      const k = handle.kysely
      const now = Date.now()
      const user = (id: string, scope_mode: string) => ({
        id,
        username: id,
        password_hash: 'x',
        role: 'operator',
        created_at: now,
        updated_at: now,
        scope_mode,
      })
      await k
        .insertInto('users')
        .values([
          user('all', 'all'),
          user('acme', 'restricted'),
          user('none', 'restricted'),
          { ...user('adm', 'restricted'), role: 'admin' },
        ])
        .execute()
      await k
        .insertInto('user_scopes')
        .values([
          { user_id: 'acme', tenant_id: 'globex', vertical: 'crm' },
          { user_id: 'acme', tenant_id: 'acme', vertical: '*' },
          { user_id: 'acme', tenant_id: 'acme', vertical: 'ecommerce' },
          { user_id: 'adm', tenant_id: 'acme', vertical: '*' },
        ])
        .execute()
      const row = (id: string, owner: string, visibility: string) => ({
        id,
        name: id,
        description: null,
        layout_json: '[]',
        owner_user_id: owner,
        visibility,
        created_at: now,
        updated_at: now,
      })
      await k
        .insertInto('dashboards')
        .values([
          row('d_all', 'all', 'shared'),
          row('d_acme', 'acme', 'shared'),
          row('d_none', 'none', 'shared'),
          row('d_priv', 'acme', 'private'),
          row('d_adm', 'adm', 'shared'),
        ])
        .execute()
      await AdminStore.create(handle) // applies v6
      const store = await DashboardStore.create(handle)
      expect((await store.get('d_all'))!.audience).toEqual({ kind: 'everyone' })
      expect((await store.get('d_acme'))!.audience).toEqual({
        kind: 'tenants',
        tenants: ['acme', 'globex'],
      })
      expect((await store.get('d_none'))!.audience).toEqual({ kind: 'private' })
      expect((await store.get('d_priv'))!.audience).toEqual({ kind: 'private' })
      // Admins are always unrestricted, whatever a stale scope row says.
      expect((await store.get('d_adm'))!.audience).toEqual({ kind: 'everyone' })
      expect((await store.get('d_acme'))!.pinnedTenants).toBeNull()
    })
  })
}
