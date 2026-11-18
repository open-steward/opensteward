import { describe, it, expect } from 'vitest'
import { resolveRole, readClaimValues } from '../../src/core/auth/idp/role-mapping'
import type { RoleMappingRuleRow } from '../../src/core/db/identity-store'

function rule(p: Partial<RoleMappingRuleRow>): RoleMappingRuleRow {
  return {
    id: 1,
    providerId: 'p',
    priority: 100,
    claimPath: 'groups',
    matchType: 'equals',
    matchValue: 'x',
    role: 'viewer',
    createdAt: 0,
    ...p,
  }
}

describe('role-mapping', () => {
  it('reads nested + array claim values', () => {
    expect(readClaimValues({ groups: ['a', 'b'] }, 'groups')).toEqual(['a', 'b'])
    expect(readClaimValues({ realm: { roles: 'admin' } }, 'realm.roles')).toEqual(['admin'])
    expect(readClaimValues({}, 'missing')).toEqual([])
  })

  it('first match wins by ascending priority', () => {
    const rules = [
      rule({ id: 2, priority: 200, matchValue: 'Eng', role: 'operator' }),
      rule({ id: 1, priority: 50, matchValue: 'Admins', role: 'admin' }),
    ].sort((a, b) => a.priority - b.priority)
    expect(resolveRole(rules, { groups: ['Eng', 'Admins'] }, 'viewer')).toBe('admin')
  })

  it('falls back to default role when nothing matches', () => {
    const rules = [rule({ matchValue: 'Admins', role: 'admin' })]
    expect(resolveRole(rules, { groups: ['Sales'] }, 'operator')).toBe('operator')
  })

  it('supports contains and regex', () => {
    expect(resolveRole([rule({ matchType: 'contains', matchValue: 'dmin', role: 'admin' })], { groups: ['Admins'] }, 'viewer')).toBe('admin')
    expect(resolveRole([rule({ matchType: 'regex', matchValue: '^ops-.*$', role: 'operator' })], { groups: ['ops-eu'] }, 'viewer')).toBe('operator')
  })

  it('caps overly long regex (no match, no throw)', () => {
    const long = 'a'.repeat(500)
    expect(resolveRole([rule({ matchType: 'regex', matchValue: long, role: 'admin' })], { groups: ['x'] }, 'viewer')).toBe('viewer')
  })

  it('invalid regex never matches', () => {
    expect(resolveRole([rule({ matchType: 'regex', matchValue: '(', role: 'admin' })], { groups: ['x'] }, 'viewer')).toBe('viewer')
  })
})
