import { describe, it, expect } from 'vitest'
import { transformUser } from '../../../../../../../src/verticals/customer-support/adapters/jitbit-helpdesk/transform/user'
import type { RawJitbitUser } from '../../../../../../../src/verticals/customer-support/adapters/jitbit-helpdesk/transform/contact'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

describe('jitbit-helpdesk transformUser', () => {
  it('maps IsAdmin=true to role admin', () => {
    const raw: RawJitbitUser = { UserID: 1, FirstName: 'Admin', IsAdmin: true, IsTech: false }
    const result = transformUser(raw)
    expect(result.role).toBe('admin')
  })

  it('maps IsTech=true (non-admin) to role agent', () => {
    const raw: RawJitbitUser = { UserID: 2, FirstName: 'Tech', IsAdmin: false, IsTech: true }
    const result = transformUser(raw)
    expect(result.role).toBe('agent')
  })

  it('maps non-tech non-admin to role user', () => {
    const raw: RawJitbitUser = { UserID: 3, FirstName: 'Regular', IsAdmin: false, IsTech: false }
    const result = transformUser(raw)
    expect(result.role).toBe('user')
  })

  it('concatenates FirstName and LastName', () => {
    const raw: RawJitbitUser = { UserID: 4, FirstName: 'Jane', LastName: 'Doe', IsTech: true }
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to Username when name parts are absent', () => {
    const raw: RawJitbitUser = { UserID: 5, Username: 'jdoe', IsTech: true }
    const result = transformUser(raw)
    expect(result.name).toBe('jdoe')
  })

  it('maps Email to email', () => {
    const raw: RawJitbitUser = {
      UserID: 6,
      FirstName: 'Agent',
      Email: 'agent@jitbit.com',
      IsTech: true,
    }
    const result = transformUser(raw)
    expect(result.email).toBe('agent@jitbit.com')
  })

  it('teamIds is always empty array (jitbit uses categories, not teams)', () => {
    const raw: RawJitbitUser = { UserID: 7, FirstName: 'X', IsTech: true }
    const result = transformUser(raw)
    expect(result.teamIds).toEqual([])
  })

  it('sets platform to jitbit-helpdesk', () => {
    const raw: RawJitbitUser = { UserID: 8, FirstName: 'Y', IsTech: true }
    const result = transformUser(raw)
    expect(result.platform).toBe('jitbit-helpdesk')
  })

  it('passes UserSchema validation', () => {
    const raw: RawJitbitUser = {
      UserID: 99,
      FirstName: 'Valid',
      LastName: 'Agent',
      Email: 'valid@example.com',
      IsAdmin: false,
      IsTech: true,
    }
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
