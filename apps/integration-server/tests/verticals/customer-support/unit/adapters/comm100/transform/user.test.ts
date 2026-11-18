import { describe, it, expect } from 'vitest'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema'
import { transformUser } from '../../../../../../../src/verticals/customer-support/adapters/comm100/transform/user'
import { DOC_AGENT } from '../fixtures'

describe('comm100 transformUser', () => {
  it('maps the documented agent example', () => {
    const u = UserSchema.parse(transformUser(DOC_AGENT))
    expect(u.id).toBe('2e4e44a0-3910-41e7-a9b5-b7cfe8f2d52d')
    expect(u.name).toBe('test Comm100')
    expect(u.role).toBe('admin')
    expect(u.teamIds).toEqual(['b6ff11d8-0be7-4e99-b8c7-5a7ab501c69b'])
    expect(u.metadata['isActive']).toBe('true')
  })

  it('drops an email the canonical schema would reject (the example\'s "test@2.ccc" passes)', () => {
    expect(UserSchema.parse(transformUser(DOC_AGENT)).email).toBe('test@2.ccc')
    expect(
      UserSchema.parse(transformUser({ ...DOC_AGENT, email: 'not-an-email' })).email,
    ).toBeUndefined()
  })

  it('maps a non-admin agent to role agent', () => {
    expect(UserSchema.parse(transformUser({ ...DOC_AGENT, isAdmin: false })).role).toBe('agent')
  })
})
