/**
 * Fixture: the POST /uapi/users sample response,
 * https://api.usedocs.com/article/51414.
 */
import { describe, expect, it } from 'vitest'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'
import { transformUser } from '../../../../../../../src/verticals/customer-support/adapters/usedesk/transform/user'

export const documentedAgent = {
  id: '558',
  name: 'Agent Name',
  email: 'agent@gmail.com',
  position: '',
  role: 'admin',
  phone: null,
  chat_online_status: '1',
  online_status: '0',
  groups: [
    {
      id: '123',
      name: 'Group',
      company_id: '153561',
      deleted: '0',
      deleted_at: '0000-00-00 00:00:00',
      pivot: { user_id: '558', user_group_id: '413' },
    },
    {
      id: '354',
      name: 'Group 2',
      company_id: '153561',
      deleted: '0',
      deleted_at: '0000-00-00 00:00:00',
      pivot: { user_id: '558', user_group_id: '354' },
    },
  ],
}

describe('usedesk transformUser (documented agent)', () => {
  it('parses against UserSchema', () => {
    const out = UserSchema.parse(transformUser(documentedAgent))
    expect(out).toMatchObject({
      id: '558',
      externalId: '558',
      name: 'Agent Name',
      email: 'agent@gmail.com',
      role: 'admin',
      teamIds: ['123', '354'],
      platform: 'usedesk',
    })
    expect(out.metadata).toEqual({ onlineStatus: '0', chatOnlineStatus: '1' })
  })

  it('an agent with no groups has no teams', () => {
    expect(UserSchema.parse(transformUser({ ...documentedAgent, groups: [] })).teamIds).toEqual([])
  })

  it('an unset (empty-string) email is omitted, not an invalid email', () => {
    const out = UserSchema.parse(transformUser({ ...documentedAgent, email: '' }))
    expect(out.email).toBeUndefined()
  })

  it('throws on a row with no id', () => {
    expect(() => transformUser({ ...documentedAgent, id: undefined })).toThrow(/no id/)
  })
})
