import { describe, it, expect } from 'vitest'
import { transformUser } from '../../../../../../../src/verticals/customer-support/adapters/helpjuice/transform/user'
import type { RawHelpjuiceUser } from '../../../../../../../src/verticals/customer-support/adapters/helpjuice/transform/contact'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

describe('helpjuice transformUser', () => {
  it('maps role_id 1 to viewer', () => {
    const raw: RawHelpjuiceUser = { id: 1, name: 'Reader', role_id: 1 }
    const result = transformUser(raw)
    expect(result.role).toBe('viewer')
  })

  it('maps role_id 2 to contributor', () => {
    const raw: RawHelpjuiceUser = { id: 2, name: 'Editor', role_id: 2 }
    const result = transformUser(raw)
    expect(result.role).toBe('contributor')
  })

  it('maps role_id 3 to admin', () => {
    const raw: RawHelpjuiceUser = { id: 3, name: 'Admin User', role_id: 3 }
    const result = transformUser(raw)
    expect(result.role).toBe('admin')
  })

  it('maps role_id 4 to super_admin', () => {
    const raw: RawHelpjuiceUser = { id: 4, name: 'Super Admin', role_id: 4 }
    const result = transformUser(raw)
    expect(result.role).toBe('super_admin')
  })

  it('builds name from first_name and last_name when name is absent', () => {
    const raw: RawHelpjuiceUser = { id: 5, first_name: 'Jane', last_name: 'Doe', role_id: 2 }
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email from raw.email', () => {
    const raw: RawHelpjuiceUser = { id: 6, name: 'User', email: 'agent@helpjuice.com' }
    const result = transformUser(raw)
    expect(result.email).toBe('agent@helpjuice.com')
  })

  it('sets platform to helpjuice', () => {
    const raw: RawHelpjuiceUser = { id: 7, name: 'Someone' }
    const result = transformUser(raw)
    expect(result.platform).toBe('helpjuice')
  })

  it('teamIds is always an empty array', () => {
    const raw: RawHelpjuiceUser = { id: 8, name: 'User' }
    const result = transformUser(raw)
    expect(result.teamIds).toEqual([])
  })

  it('passes UserSchema validation', () => {
    const raw: RawHelpjuiceUser = {
      id: 99,
      name: 'Schema User',
      email: 'schema@example.com',
      role_id: 3,
    }
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
