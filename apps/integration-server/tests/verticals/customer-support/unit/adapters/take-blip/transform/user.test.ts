/**
 * Fixture is the documented "Get all bot's agents" example item (docs.blip.ai,
 * response to GET /attendants).
 */
import { describe, expect, it } from 'vitest'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'
import { transformUser } from '../../../../../../../src/verticals/customer-support/adapters/take-blip/transform/user'

const attendant = {
  identity: 'rafaelpa%40take.net@blip.ai',
  teams: ['Default'],
  status: 'Online',
  lastServiceDate: '2018-07-05T19:39:07.640Z',
}

describe('take-blip transformUser', () => {
  it('maps the documented attendant through the canonical schema', () => {
    const out = UserSchema.parse(transformUser(attendant))
    expect(out).toMatchObject({
      id: 'rafaelpa%40take.net@blip.ai',
      externalId: 'rafaelpa%40take.net@blip.ai',
      name: 'rafaelpa%40take.net@blip.ai',
      teamIds: ['Default'],
      platform: 'take-blip',
      metadata: { status: 'Online', lastServiceDate: '2018-07-05T19:39:07.640Z' },
    })
    expect(out.email).toBeUndefined()
    expect(out.role).toBeUndefined()
  })

  it('teamIds is empty when teams is absent', () => {
    expect(UserSchema.parse(transformUser({ identity: 'a@blip.ai' })).teamIds).toEqual([])
  })

  it('throws on an attendant without an identity', () => {
    expect(() => transformUser({ teams: ['Default'] })).toThrow(/no identity/)
  })
})
