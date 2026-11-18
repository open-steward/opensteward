/**
 * Permission model persistence: admin_store v3 (roles, user role/scope) and
 * identity_store v2 (custom-role and scope-mapping rules), plus the access
 * resolution that reads them.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { openDb, PERMISSIONS } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { IdentityStore } from '../../src/core/db/identity-store'
import {
  invalidateAccess,
  resolveAccess,
  tenantAllowed,
  toProxyScope,
  toScopeView,
} from '../../src/core/auth/access'

const SECRET = 'test-store-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa'

const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

describe.each(BACKENDS)('permission model store [$name]', (backend) => {
  let admin: AdminStore | undefined
  let idp: IdentityStore

  beforeEach(() => invalidateAccess())

  async function open() {
    const handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    admin = await AdminStore.create(handle)
    idp = await IdentityStore.create(handle, SECRET)
    return admin
  }

  afterEach(async () => {
    await admin?.close()
    admin = undefined
  })

  it('migrates: seeds the three built-in roles with code-defined permissions', async () => {
    const store = await open()
    const roles = await store.listRoles()
    expect(roles.map((r) => r.id)).toEqual(['viewer', 'operator', 'admin'])
    expect(roles.every((r) => r.isBuiltin)).toBe(true)
    expect(roles.find((r) => r.id === 'admin')!.permissions).toEqual([...PERMISSIONS])
    expect(roles.find((r) => r.id === 'viewer')!.permissions).toEqual([
      'connections:read',
      'dashboards:view',
    ])
  })

  it('migrates: existing users default to the built-in role and scope all', async () => {
    const store = await open()
    const u = await store.createUser('alice', 'hash', 'operator')
    expect(u.role_id ?? null).toBeNull()
    expect(u.scope_mode).toBe('all')
    expect(u.scope_source).toBe('manual')
    expect(await store.getUserScope(u.id)).toEqual({ mode: 'all', source: 'manual', grants: [] })
  })

  it('records one schema.migrate audit row for v3', async () => {
    const store = await open()
    const rows = await store.listAudit(100, 0, { action: 'schema.migrate' })
    const versions = rows
      .filter((r) => r.target_id === 'admin_store')
      .map((r) => JSON.parse(r.detail ?? '{}').version)
    expect(versions).toContain(3)
  })

  it('creates, edits and deletes a custom role; built-ins are immutable', async () => {
    const store = await open()
    const role = await store.createRole({
      name: 'Support',
      baseRole: 'operator',
      permissions: ['data:read', 'connections:read', 'data:read'],
      createdBy: 'u1',
    })
    expect(role.isBuiltin).toBe(false)
    expect(role.permissions).toEqual(['connections:read', 'data:read'])
    expect((await store.getRoleByName('support'))?.id).toBe(role.id)

    const updated = await store.updateRole(role.id, { permissions: ['connections:read'] }, 'u1')
    expect(updated.ok && updated.role.permissions).toEqual(['connections:read'])

    expect(await store.updateRole('admin', { name: 'root' }, 'u1')).toEqual({
      ok: false,
      reason: 'builtin',
    })
    expect(await store.deleteRole('viewer')).toEqual({ ok: false, reason: 'builtin' })
    expect(await store.deleteRole(role.id)).toEqual({ ok: true })
    expect(await store.getRole(role.id)).toBeNull()
  })

  it('refuses to delete a role in use, and keeps users.role on the base role', async () => {
    const store = await open()
    const role = await store.createRole({
      name: 'Analyst',
      baseRole: 'viewer',
      permissions: ['data:read'],
      createdBy: null,
    })
    const u = await store.createUser('bob', 'hash', 'admin')
    const assigned = await store.assignUserRole(u.id, role.id)
    expect(assigned?.role).toBe('viewer')
    expect(assigned?.role_id).toBe(role.id)
    expect(await store.deleteRole(role.id)).toEqual({ ok: false, reason: 'in_use', users: 1 })

    // A base-role change reaches every holder.
    await store.updateRole(role.id, { baseRole: 'operator' }, null)
    expect((await store.getUserById(u.id))?.role).toBe('operator')

    // Back to a built-in clears the custom role.
    await store.assignUserRole(u.id, 'viewer')
    const back = await store.getUserById(u.id)
    expect(back?.role).toBe('viewer')
    expect(back?.role_id ?? null).toBeNull()
    expect(await store.deleteRole(role.id)).toEqual({ ok: true })
  })

  it('stores a restricted scope, collapsing a tenant-wide grant', async () => {
    const store = await open()
    const u = await store.createUser('carol', 'hash', 'operator')
    const scope = await store.setUserScope(
      u.id,
      {
        mode: 'restricted',
        grants: [
          { tenantId: 'acme', verticals: ['crm', 'accounting'] },
          { tenantId: 'acme', verticals: '*' },
          { tenantId: 'globex', verticals: ['crm', 'crm'] },
        ],
      },
      'manual',
    )
    expect(scope).toEqual({
      mode: 'restricted',
      source: 'manual',
      grants: [
        { tenantId: 'acme', verticals: '*' },
        { tenantId: 'globex', verticals: ['crm'] },
      ],
    })
    // Back to all clears every grant row.
    await store.setUserScope(u.id, { mode: 'all', grants: [] }, 'idp')
    expect(await store.getUserScope(u.id)).toEqual({ mode: 'all', source: 'idp', grants: [] })
  })

  it('deleting a user deletes its scope rows', async () => {
    const store = await open()
    const u = await store.createUser('dave', 'hash', 'viewer')
    await store.setUserScope(
      u.id,
      { mode: 'restricted', grants: [{ tenantId: 'acme', verticals: '*' }] },
      'manual',
    )
    expect(await store.deleteUser(u.id)).toBe(true)
    const rows = await store
      .getHandle()
      .kysely.selectFrom('user_scopes')
      .selectAll()
      .where('user_id', '=', u.id)
      .execute()
    expect(rows).toEqual([])
  })

  it('resolves access: built-in, custom role, scope, and invalidation on write', async () => {
    const store = await open()
    const u = await store.createUser('erin', 'hash', 'operator')

    const builtin = await resolveAccess(store, u.id)
    expect(builtin.roleId).toBe('operator')
    expect(builtin.permissions.has('data:export')).toBe(true)
    expect(builtin.permissions.has('data:read_pii')).toBe(false)
    expect(builtin.scope).toEqual({ mode: 'all' })
    expect(toProxyScope(builtin)).toEqual({ tenants: '*' })

    const role = await store.createRole({
      name: 'PII reader',
      baseRole: 'viewer',
      permissions: ['connections:read', 'data:read', 'data:read_pii'],
      createdBy: null,
    })
    await store.assignUserRole(u.id, role.id)
    await store.setUserScope(
      u.id,
      { mode: 'restricted', grants: [{ tenantId: 'acme', verticals: ['crm'] }] },
      'manual',
    )
    // No explicit invalidate: the store writes must have dropped the cache.
    const custom = await resolveAccess(store, u.id)
    expect(custom.roleId).toBe(role.id)
    expect(custom.roleName).toBe('PII reader')
    expect(custom.baseRole).toBe('viewer')
    expect([...custom.permissions].sort()).toEqual([
      'connections:read',
      'data:read',
      'data:read_pii',
    ])
    expect(tenantAllowed(custom, 'acme')).toBe(true)
    expect(tenantAllowed(custom, 'acme', 'crm')).toBe(true)
    expect(tenantAllowed(custom, 'acme', 'accounting')).toBe(false)
    expect(tenantAllowed(custom, 'globex')).toBe(false)
    expect(tenantAllowed(custom, null)).toBe(false)
    expect(toProxyScope(custom)).toEqual({ tenants: ['acme'], verticals: { acme: ['crm'] } })
    expect(toScopeView(custom)).toEqual({
      mode: 'restricted',
      grants: [{ tenantId: 'acme', verticals: ['crm'] }],
    })
  })

  it('resolves a deleted user to no access at all', async () => {
    const store = await open()
    const access = await resolveAccess(store, 'no-such-user')
    expect(access.permissions.size).toBe(0)
    expect(access.scope.mode).toBe('restricted')
    expect(tenantAllowed(access, 'default')).toBe(false)
  })

  it('identity_store v2: custom-role rules, scope rules and provider default scope', async () => {
    await open()
    const p = await idp.createProvider({ name: 'Okta', slug: 'okta', protocol: 'oidc' })
    // New providers start with no tenants; pre-existing ones keep `all`
    // through the column default.
    expect(p.defaultScopeMode).toBe('restricted')
    expect(p.defaultTenantIds).toEqual([])

    const role = await admin!.createRole({
      name: 'X',
      baseRole: 'operator',
      permissions: [],
      createdBy: null,
    })
    const rule = await idp.createRule({
      providerId: p.id,
      claimPath: 'groups',
      matchType: 'equals',
      matchValue: 'x',
      role: 'operator',
      roleId: role.id,
    })
    expect(rule.roleId).toBe(role.id)
    expect(await idp.countRulesForRole(role.id)).toBe(1)
    await idp.syncRuleBaseRole(role.id, 'viewer')
    expect((await idp.listRules(p.id))[0]!.role).toBe('viewer')

    const scopeRule = await idp.createScopeRule({
      providerId: p.id,
      claimPath: 'groups',
      matchType: 'equals',
      matchValue: 'acme-team',
      tenantIds: ['acme', 'acme'],
    })
    expect(scopeRule.tenantIds).toEqual(['acme'])
    expect(scopeRule.verticals).toBe('*')
    const narrow = await idp.createScopeRule({
      providerId: p.id,
      claimPath: 'groups',
      matchType: 'equals',
      matchValue: 'globex-crm',
      tenantIds: ['globex'],
      verticals: ['crm'],
    })
    expect(narrow.verticals).toEqual(['crm'])
    expect((await idp.listScopeRules(p.id)).map((r) => r.id)).toEqual([scopeRule.id, narrow.id])

    const updated = await idp.updateProviderDefaultScope(p.id, {
      mode: 'restricted',
      tenantIds: ['default'],
    })
    expect(updated?.defaultScopeMode).toBe('restricted')
    expect(updated?.defaultTenantIds).toEqual(['default'])

    expect(await idp.deleteScopeRule(narrow.id, p.id)).toBe(true)
    expect(await idp.deleteProvider(p.id)).toBe(true)
    // Provider deletion cascades to its scope rules.
    const left = await admin!
      .getHandle()
      .kysely.selectFrom('scope_mapping_rules')
      .selectAll()
      .execute()
    expect(left).toEqual([])
  })
})
