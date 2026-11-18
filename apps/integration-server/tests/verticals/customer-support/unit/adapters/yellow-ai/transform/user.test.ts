import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawYellowAiAgent,
} from '../../../../../../../src/verticals/customer-support/adapters/yellow-ai/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'
import { DOC_AGENT } from '../fixtures'

describe('transformUser (Agent chat concurrency agents[])', () => {
  it('maps the documented example agent and parses as a User', () => {
    const user = UserSchema.parse(transformUser(DOC_AGENT))
    expect(user).toEqual({
      id: 'agent1',
      externalId: 'agent1',
      email: 'agent1@feg.eu',
      name: 'Agent One',
      teamIds: ['support', 'billing'],
      platform: 'yellow-ai',
      metadata: {
        status: 'available',
        currentChatConcurrency: '2',
        maxChatConcurrency: '50',
      },
      raw: DOC_AGENT,
    })
  })

  it('omits a null maxChatConcurrency ("nullable": true) from metadata', () => {
    const user = UserSchema.parse(transformUser({ ...DOC_AGENT, maxChatConcurrency: null }))
    expect(user.metadata).not.toHaveProperty('maxChatConcurrency')
  })

  it('leaves email and teamIds empty when the optional fields are absent', () => {
    const raw: RawYellowAiAgent = { agentId: 'agent2', agentProfile: { name: 'Agent Two' } }
    const user = UserSchema.parse(transformUser(raw))
    expect(user.email).toBeUndefined()
    expect(user.teamIds).toEqual([])
    expect(user.name).toBe('Agent Two')
  })

  it('throws when agentId is missing rather than inventing an id', () => {
    expect(() => transformUser({ agentProfile: { name: 'No Id' } })).toThrow(/agentId/)
  })
})
