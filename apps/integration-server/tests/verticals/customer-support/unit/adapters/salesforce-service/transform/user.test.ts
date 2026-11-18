import { describe, it, expect } from 'vitest'
import { transformUser } from '../../../../../../../src/verticals/customer-support/adapters/salesforce-service/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'
import { USER } from '../fixtures'

describe('transformUser (User)', () => {
  it('maps a Standard user and parses as a User', () => {
    const u = UserSchema.parse(transformUser(USER))
    expect(u).toEqual({
      id: '005D0000005Bk90IAC',
      externalId: '005D0000005Bk90IAC',
      email: 'olivia.admin@northwind.example',
      name: 'Olivia Admin',
      role: 'Standard',
      teamIds: [],
      platform: 'salesforce-service',
      metadata: { isActive: 'true', userRoleId: '00ED0000000abcdMAA' },
      raw: USER,
    })
  })

  it('an inactive user with no role parses, isActive false kept', () => {
    const u = UserSchema.parse(transformUser({ ...USER, IsActive: false, UserRoleId: null }))
    expect(u.metadata).toEqual({ isActive: 'false' })
  })
})
