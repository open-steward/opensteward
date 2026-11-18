import { describe, it, expect } from 'vitest'
import {
  BUILTIN_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  isBuiltinRole,
  isPermission,
  missingPermissions,
  normalizePermissions,
  permissionsForBuiltin,
} from '../../src/auth/permissions'

describe('permission catalog', () => {
  it('describes every permission', () => {
    expect(Object.keys(PERMISSION_DESCRIPTIONS).sort()).toEqual([...PERMISSIONS].sort())
  })

  it('gives viewer read-only access', () => {
    expect([...BUILTIN_ROLE_PERMISSIONS.viewer]).toEqual(['connections:read', 'dashboards:view'])
  })

  it('gives operator viewer plus manage, data read/export and dashboard edit', () => {
    const operator = permissionsForBuiltin('operator')
    for (const p of BUILTIN_ROLE_PERMISSIONS.viewer) expect(operator.has(p)).toBe(true)
    for (const p of [
      'connections:manage',
      'data:read',
      'data:export',
      'dashboards:edit',
    ] as const) {
      expect(operator.has(p)).toBe(true)
    }
    // PII and the admin-only surfaces stay with admin.
    expect(operator.has('data:read_pii')).toBe(false)
    expect(operator.has('roles:manage')).toBe(false)
    expect(operator.has('users:manage')).toBe(false)
  })

  it('gives admin every permission', () => {
    expect([...permissionsForBuiltin('admin')].sort()).toEqual([...PERMISSIONS].sort())
  })

  it('gives an unknown role nothing', () => {
    expect(permissionsForBuiltin('superuser').size).toBe(0)
    expect(isBuiltinRole('superuser')).toBe(false)
    expect(isBuiltinRole('viewer')).toBe(true)
  })
})

describe('isPermission', () => {
  it('accepts catalog entries only', () => {
    expect(isPermission('data:read')).toBe(true)
    expect(isPermission('data:write')).toBe(false)
    expect(isPermission(42)).toBe(false)
    // Prototype keys must not read as permissions.
    expect(isPermission('constructor')).toBe(false)
  })
})

describe('normalizePermissions', () => {
  it('drops unknown values, de-duplicates and orders by catalog', () => {
    expect(
      normalizePermissions(['data:export', 'bogus', 'connections:read', 'data:export']),
    ).toEqual(['connections:read', 'data:export'])
  })

  it('reads a non-array as empty', () => {
    expect(normalizePermissions('data:read')).toEqual([])
    expect(normalizePermissions(null)).toEqual([])
  })
})

describe('missingPermissions', () => {
  it('lists what the holder lacks', () => {
    const operator = permissionsForBuiltin('operator')
    expect(missingPermissions(operator, ['data:read', 'data:read_pii', 'roles:manage'])).toEqual([
      'data:read_pii',
      'roles:manage',
    ])
    expect(missingPermissions(operator, ['data:read'])).toEqual([])
  })

  it('dashboards:share_all is held by admin only', () => {
    expect(PERMISSIONS).toContain('dashboards:share_all')
    expect(BUILTIN_ROLE_PERMISSIONS.admin).toContain('dashboards:share_all')
    expect(BUILTIN_ROLE_PERMISSIONS.operator).not.toContain('dashboards:share_all')
    expect(BUILTIN_ROLE_PERMISSIONS.viewer).not.toContain('dashboards:share_all')
    expect(PERMISSION_DESCRIPTIONS['dashboards:share_all']).toBe(
      'Share dashboards with everyone, and choose who sees embedded Superset dashboards.',
    )
  })
})
