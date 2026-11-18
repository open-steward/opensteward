/** Pure escalation guards: what a caller may grant, by permission, base role and tenant. */
import { describe, it, expect } from 'vitest'
import { permissionsForBuiltin, type Permission } from '@opensteward/shared'
import {
  grantsToTenantMap,
  roleGrantRefusal,
  scopeWithin,
  type Access,
  type CallerContext,
} from '../../src/core/auth/access'

function access(
  perms: Permission[],
  scope: Access['scope'],
  baseRole: Access['baseRole'] = 'operator',
): Access {
  return { userId: 'u', baseRole, roleId: 'r', roleName: 'r', permissions: new Set(perms), scope }
}

const restricted = (grants: Parameters<typeof grantsToTenantMap>[0]) =>
  ({ mode: 'restricted', tenants: grantsToTenantMap(grants) }) as const

describe('roleGrantRefusal', () => {
  const caller: CallerContext = {
    access: null,
    permissions: permissionsForBuiltin('operator'),
    baseRole: 'operator',
  }

  it('allows a subset at or below the caller base role', () => {
    expect(roleGrantRefusal(caller, { permissions: ['data:read'], baseRole: 'viewer' })).toBeNull()
    expect(
      roleGrantRefusal(caller, {
        permissions: [...permissionsForBuiltin('operator')],
        baseRole: 'operator',
      }),
    ).toBeNull()
  })

  it('names the permissions the caller lacks', () => {
    expect(
      roleGrantRefusal(caller, {
        permissions: ['data:read', 'data:read_pii', 'users:manage'],
        baseRole: 'viewer',
      }),
    ).toBe('You cannot grant permissions you do not hold: data:read_pii, users:manage')
  })

  it('refuses a base role above the caller', () => {
    expect(roleGrantRefusal(caller, { permissions: [], baseRole: 'admin' })).toMatch(
      /admin base role/,
    )
  })
})

describe('scopeWithin', () => {
  const holder = access(
    ['users:manage'],
    restricted([
      { tenantId: 'acme', verticals: '*' },
      { tenantId: 'globex', verticals: ['crm'] },
    ]),
  )

  it('lets an unrestricted holder grant anything', () => {
    expect(scopeWithin(access([], { mode: 'all' }), { mode: 'all', grants: [] })).toBe(true)
  })

  it('never lets a restricted holder grant all', () => {
    expect(scopeWithin(holder, { mode: 'all', grants: [] })).toBe(false)
  })

  it('allows tenants and verticals the holder has', () => {
    expect(
      scopeWithin(holder, {
        mode: 'restricted',
        grants: [
          { tenantId: 'acme', verticals: ['accounting'] },
          { tenantId: 'globex', verticals: ['crm'] },
        ],
      }),
    ).toBe(true)
  })

  it('refuses another tenant, a wider vertical set, or a tenant-wide grant on a narrow one', () => {
    expect(
      scopeWithin(holder, {
        mode: 'restricted',
        grants: [{ tenantId: 'initech', verticals: '*' }],
      }),
    ).toBe(false)
    expect(
      scopeWithin(holder, {
        mode: 'restricted',
        grants: [{ tenantId: 'globex', verticals: ['crm', 'hr'] }],
      }),
    ).toBe(false)
    expect(
      scopeWithin(holder, { mode: 'restricted', grants: [{ tenantId: 'globex', verticals: '*' }] }),
    ).toBe(false)
  })
})
