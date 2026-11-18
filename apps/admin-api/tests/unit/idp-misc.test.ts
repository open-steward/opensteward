import { describe, it, expect } from 'vitest'
import { sanitizeReturnTo } from '../../src/core/auth/idp/return-to'
import { buildTokenPayload } from '../../src/core/auth/idp/issue-token'
import { ScimUserSchema, ScimPatchSchema, parseEqFilter, pickEmail } from '../../src/core/auth/idp/scim-schema'
import { escapeLdapValue } from '../../src/core/auth/idp/ldap-provider'

describe('sanitizeReturnTo (open-redirect guard)', () => {
  it('allows same-origin relative paths', () => {
    expect(sanitizeReturnTo('/users')).toBe('/users')
    expect(sanitizeReturnTo('/connections?vertical=accounting')).toBe('/connections?vertical=accounting')
  })
  it('rejects absolute, protocol-relative, scheme, and backslash targets', () => {
    expect(sanitizeReturnTo('https://evil.com')).toBe('/')
    expect(sanitizeReturnTo('//evil.com')).toBe('/')
    expect(sanitizeReturnTo('/\\evil.com')).toBe('/')
    expect(sanitizeReturnTo('/javascript:alert(1)')).toBe('/') // scheme-like first segment rejected
    expect(sanitizeReturnTo('javascript:alert(1)')).toBe('/')
    expect(sanitizeReturnTo(undefined)).toBe('/')
  })
})

describe('issue-token payload shape', () => {
  it('emits exactly { id, username, role }', () => {
    const p = buildTokenPayload({ id: 'u1', username: 'a', role: 'admin' })
    expect(Object.keys(p).sort()).toEqual(['id', 'role', 'username'])
  })
})

describe('SCIM schema', () => {
  it('validates a core user payload', () => {
    const parsed = ScimUserSchema.safeParse({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: 'jane@x.com',
      externalId: 'okta-1',
      emails: [{ value: 'jane@x.com', primary: true }],
      active: true,
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(pickEmail(parsed.data)).toBe('jane@x.com')
  })
  it('requires userName', () => {
    expect(ScimUserSchema.safeParse({ active: true }).success).toBe(false)
  })
  it('parses PatchOp envelopes and eq filters', () => {
    expect(
      ScimPatchSchema.safeParse({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'Replace', value: { active: false } }],
      }).success,
    ).toBe(true)
    expect(parseEqFilter('userName eq "jane@x.com"')).toEqual({ attr: 'userName', value: 'jane@x.com' })
    expect(parseEqFilter('garbage')).toBeNull()
  })
})

describe('LDAP filter escaping (injection guard)', () => {
  it('escapes special characters per RFC 4515', () => {
    expect(escapeLdapValue('a*b')).toBe('a\\2ab')
    expect(escapeLdapValue('a)b(c')).toBe('a\\29b\\28c')
    expect(escapeLdapValue('a\\b')).toBe('a\\5cb')
  })
})
