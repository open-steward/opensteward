import { describe, it, expect } from 'vitest'
import { transformTeam } from '../../../../../../../src/verticals/customer-support/adapters/salesforce-service/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'
import { QUEUE } from '../fixtures'

describe('transformTeam (Group of Type Queue)', () => {
  it('maps a queue and parses as a Team', () => {
    const t = TeamSchema.parse(transformTeam(QUEUE))
    expect(t).toEqual({
      id: '00GD0000001aBcDMAU',
      externalId: '00GD0000001aBcDMAU',
      name: 'Tier 1 Support',
      platform: 'salesforce-service',
      metadata: {
        developerName: 'Tier_1_Support',
        email: 'tier1@northwind.example',
        type: 'Queue',
      },
      raw: QUEUE,
    })
  })

  it('falls back to DeveloperName when Name is empty', () => {
    const t = TeamSchema.parse(transformTeam({ ...QUEUE, Name: '' }))
    expect(t.name).toBe('Tier_1_Support')
  })
})
