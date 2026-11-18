/**
 * Fixture: the documented get-agent record
 * (https://developers.faveohelpdesk.com/get-agent-admin/).
 */
import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawFaveoAgent,
} from '../../../../../../../src/verticals/customer-support/adapters/faveo-helpdesk/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

const documented: RawFaveoAgent = {
  id: 101,
  user_name: 'krishna',
  role: 'agent',
  email: 'krishna@faveo.com',
  profile_pic:
    'https://secure.gravatar.com/avatar/d15e173f92f94fd80a5ef7773a19b25e?s=80&r=g&d=identicon',
  ext: '080',
  country_code: 91,
  mobile: '9853453453',
  phone_number: '41536699',
  mobile_otp_verify: '1',
  email_verify: '1',
  ban: 0,
  active: 1,
  is_delete: 0,
  agent_tzone: '1',
  departments: [
    { id: 1, name: 'Support' },
    { id: 2, name: 'Sales' },
  ],
  teams: [
    { id: 1, name: 'Level 1 Support' },
    { id: 2, name: 'Level 2 Support' },
  ],
  name: 'Krishna Vishwakarma',
}

describe('faveo-helpdesk transformUser', () => {
  it('maps the documented agent onto the canonical schema', () => {
    const u = UserSchema.parse(transformUser(documented))
    expect(u).toMatchObject({
      id: '101',
      externalId: '101',
      email: 'krishna@faveo.com',
      name: 'Krishna Vishwakarma',
      role: 'agent',
      teamIds: ['1', '2'],
      platform: 'faveo-helpdesk',
      metadata: { userName: 'krishna', active: '1', departmentIds: '1,2' },
    })
  })

  it('has no team ids when the agent has no teams', () => {
    expect(UserSchema.parse(transformUser({ ...documented, teams: [] })).teamIds).toEqual([])
  })

  it('omits an email that is not an address', () => {
    expect(transformUser({ ...documented, email: 'Not available' }).email).toBeUndefined()
  })

  it('throws when name is missing rather than inventing one', () => {
    const { name: _drop, ...rest } = documented
    expect(() => transformUser(rest as RawFaveoAgent)).toThrow(/name/)
  })
})
