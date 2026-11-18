/**
 * IdP-driven role and scope mapping: `resolveRoleAssignment` carries a
 * custom role, `resolveScope` unions every matching rule, and JIT
 * provisioning applies both — scope only to users whose scope the IdP owns.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import {
  IdentityStore,
  type RoleMappingRuleRow,
  type ScopeMappingRuleRow,
} from '../../src/core/db/identity-store'
import {
  matches,
  resolveRole,
  resolveRoleAssignment,
  resolveScope,
} from '../../src/core/auth/idp/role-mapping'
import { provisionAndMap } from '../../src/core/auth/idp/jit-provisioning'
import { invalidateAccess, resolveAccess } from '../../src/core/auth/access'

function roleRule(p: Partial<RoleMappingRuleRow>): RoleMappingRuleRow {
  return {
    id: 1,
    providerId: 'p',
    priority: 100,
    claimPath: 'groups',
    matchType: 'equals',
    matchValue: 'x',
    role: 'viewer',
    roleId: null,
    createdAt: 0,
    ...p,
  }
}

function scopeRule(p: Partial<ScopeMappingRuleRow>): ScopeMappingRuleRow {
  return {
    id: 1,
    providerId: 'p',
    priority: 100,
    claimPath: 'groups',
    matchType: 'equals',
    matchValue: 'x',
    tenantIds: [],
    verticals: '*',
    createdAt: 0,
    ...p,
  }
}

const ALL = { defaultScopeMode: 'all' as const, defaultTenantIds: [] }

describe('resolveRoleAssignment', () => {
  it('returns the custom role of the first matching rule', () => {
    const rules = [
      roleRule({
        id: 1,
        priority: 10,
        matchValue: 'support',
        role: 'operator',
        roleId: 'role-support',
      }),
      roleRule({ id: 2, priority: 20, matchValue: 'eng', role: 'admin' }),
    ]
    expect(resolveRoleAssignment(rules, { groups: ['eng', 'support'] }, 'viewer')).toEqual({
      role: 'operator',
      roleId: 'role-support',
    })
    // The legacy entry point still answers the base role alone.
    expect(resolveRole(rules, { groups: ['support'] }, 'viewer')).toBe('operator')
  })

  it('falls back to the built-in default with no custom role', () => {
    expect(
      resolveRoleAssignment([roleRule({ matchValue: 'a' })], { groups: ['b'] }, 'operator'),
    ).toEqual({
      role: 'operator',
      roleId: null,
    })
  })

  it('exports the shared matcher', () => {
    expect(matches({ matchType: 'regex', matchValue: '^acme-' }, ['acme-eu'])).toBe(true)
    expect(matches({ matchType: 'contains', matchValue: 'eu' }, ['acme-us'])).toBe(false)
  })
})

describe('resolveScope', () => {
  it('unions every matching rule, not just the first', () => {
    const rules = [
      scopeRule({ id: 1, matchValue: 'acme', tenantIds: ['acme'] }),
      scopeRule({ id: 2, matchValue: 'globex-crm', tenantIds: ['globex'], verticals: ['crm'] }),
      scopeRule({
        id: 3,
        matchValue: 'globex-acct',
        tenantIds: ['globex'],
        verticals: ['accounting'],
      }),
      scopeRule({ id: 4, matchValue: 'initech', tenantIds: ['initech'] }),
    ]
    expect(resolveScope(rules, { groups: ['acme', 'globex-crm', 'globex-acct'] }, ALL)).toEqual({
      mode: 'restricted',
      grants: [
        { tenantId: 'acme', verticals: '*' },
        { tenantId: 'globex', verticals: ['accounting', 'crm'] },
      ],
      fromDefault: false,
    })
  })

  it('lets a tenant-wide grant absorb a vertical-limited one', () => {
    const rules = [
      scopeRule({ id: 1, matchValue: 'a', tenantIds: ['acme'], verticals: ['crm'] }),
      scopeRule({ id: 2, matchValue: 'b', tenantIds: ['acme'] }),
    ]
    expect(resolveScope(rules, { groups: ['a', 'b'] }, ALL).grants).toEqual([
      { tenantId: 'acme', verticals: '*' },
    ])
  })

  it('treats a matching ["*"] rule as every tenant', () => {
    const rules = [
      scopeRule({ id: 1, matchValue: 'platform', tenantIds: ['*'] }),
      scopeRule({ id: 2, matchValue: 'acme', tenantIds: ['acme'] }),
    ]
    expect(resolveScope(rules, { groups: ['acme', 'platform'] }, ALL)).toEqual({
      mode: 'all',
      grants: [],
      fromDefault: false,
    })
  })

  it('falls back to the provider default when nothing matches', () => {
    const rules = [scopeRule({ matchValue: 'acme', tenantIds: ['acme'] })]
    expect(resolveScope(rules, { groups: ['sales'] }, ALL)).toEqual({
      mode: 'all',
      grants: [],
      fromDefault: true,
    })
    expect(
      resolveScope(rules, {}, { defaultScopeMode: 'restricted', defaultTenantIds: ['default'] }),
    ).toEqual({
      mode: 'restricted',
      grants: [{ tenantId: 'default', verticals: '*' }],
      fromDefault: true,
    })
    // Restricted with no default tenants: sees nothing.
    expect(resolveScope([], {}, { defaultScopeMode: 'restricted', defaultTenantIds: [] })).toEqual({
      mode: 'restricted',
      grants: [],
      fromDefault: true,
    })
  })
})

describe('JIT provisioning applies role and scope mapping', () => {
  let admin: AdminStore
  let idp: IdentityStore

  beforeEach(async () => {
    invalidateAccess()
    const handle = await openDb({ sqlitePath: ':memory:' })
    admin = await AdminStore.create(handle)
    idp = await IdentityStore.create(handle, 'test-store-secret-cccccccccccccccccccccccccccc')
  })
  afterEach(async () => {
    await admin?.close()
  })

  const identity = (groups: string[]) => ({
    externalId: 'ext-1',
    email: 'dana@acme.example',
    displayName: 'Dana',
    attributes: { groups },
  })

  it('creates an IdP-scoped user with the custom role, and re-syncs on the next login', async () => {
    const role = await admin.createRole({
      name: 'Support',
      baseRole: 'operator',
      permissions: ['connections:read', 'data:read'],
      createdBy: null,
    })
    const provider = await idp.createProvider({
      name: 'Okta',
      slug: 'okta',
      protocol: 'oidc',
      config: {},
    })
    await idp.createRule({
      providerId: provider.id,
      claimPath: 'groups',
      matchType: 'equals',
      matchValue: 'support',
      role: 'operator',
      roleId: role.id,
    })
    await idp.createScopeRule({
      providerId: provider.id,
      claimPath: 'groups',
      matchType: 'equals',
      matchValue: 'acme',
      tenantIds: ['acme'],
    })
    await idp.createScopeRule({
      providerId: provider.id,
      claimPath: 'groups',
      matchType: 'equals',
      matchValue: 'globex',
      tenantIds: ['globex'],
    })

    const first = await provisionAndMap(admin, idp, provider, identity(['support', 'acme']))
    expect(first.created).toBe(true)
    expect(first.user.role).toBe('operator')
    const row = (await admin.getUserById(first.user.id))!
    expect(row.role_id).toBe(role.id)
    expect(row.scope_source).toBe('idp')
    expect(await admin.getUserScope(row.id)).toEqual({
      mode: 'restricted',
      source: 'idp',
      grants: [{ tenantId: 'acme', verticals: '*' }],
    })
    const access = await resolveAccess(admin, row.id)
    expect(access.roleId).toBe(role.id)
    expect(access.permissions.has('data:read')).toBe(true)

    // Group membership changed in the IdP: both groups now, no support group.
    const second = await provisionAndMap(admin, idp, provider, identity(['acme', 'globex']))
    expect(second.roleChanged).toBe(true)
    expect(second.user.role).toBe('viewer')
    expect((await admin.getUserById(row.id))!.role_id ?? null).toBeNull()
    expect((await admin.getUserScope(row.id))!.grants.map((g) => g.tenantId)).toEqual([
      'acme',
      'globex',
    ])
  })

  it('leaves a manually scoped user alone', async () => {
    const provider = await idp.createProvider({
      name: 'Okta',
      slug: 'okta',
      protocol: 'oidc',
      config: {},
    })
    await idp.createScopeRule({
      providerId: provider.id,
      claimPath: 'groups',
      matchType: 'equals',
      matchValue: 'acme',
      tenantIds: ['acme'],
    })
    const first = await provisionAndMap(admin, idp, provider, identity(['acme']))
    // An admin pins this user to every tenant by hand.
    await admin.setUserScope(first.user.id, { mode: 'all', grants: [] }, 'manual')
    await provisionAndMap(admin, idp, provider, identity(['acme']))
    expect(await admin.getUserScope(first.user.id)).toEqual({
      mode: 'all',
      source: 'manual',
      grants: [],
    })
  })

  it('an IdP user mapped to admin gets every tenant, never the default empty scope', async () => {
    const provider = await idp.createProvider({
      name: 'Okta',
      slug: 'okta',
      protocol: 'oidc',
      config: {},
      defaultRole: 'admin',
    })
    const r = await provisionAndMap(admin, idp, provider, identity([]))
    expect((await admin.getUserScope(r.user.id))!.mode).toBe('all')
    expect((await resolveAccess(admin, r.user.id)).scope).toEqual({ mode: 'all' })
    // A second sign-in must not write the provider's empty default either.
    await provisionAndMap(admin, idp, provider, identity([]))
    expect((await admin.getUserScope(r.user.id))!.mode).toBe('all')
  })

  it('grants no tenants from a newly created provider until it is configured', async () => {
    const provider = await idp.createProvider({
      name: 'Okta',
      slug: 'okta',
      protocol: 'oidc',
      config: {},
    })
    const r = await provisionAndMap(admin, idp, provider, identity([]))
    expect(await admin.getUserScope(r.user.id)).toEqual({
      mode: 'restricted',
      source: 'idp',
      grants: [],
    })
  })
})
