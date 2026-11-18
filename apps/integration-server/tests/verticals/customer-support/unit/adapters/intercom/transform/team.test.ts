import { describe, it, expect } from 'vitest'
import { transformTeam } from '../../../../../../../src/verticals/customer-support/adapters/intercom/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('transformTeam (Intercom team)', () => {
  it('maps a team with its admin count and parses', () => {
    const t = TeamSchema.parse(
      transformTeam({
        type: 'team',
        id: '814865',
        name: 'Example Team',
        admin_ids: [493881],
        distribution_method: 'round_robin',
      }),
    )
    expect(t).toMatchObject({
      id: '814865',
      externalId: '814865',
      name: 'Example Team',
      memberCount: 1,
      platform: 'intercom',
    })
    expect(t.metadata).toEqual({ distributionMethod: 'round_robin' })
  })

  it('a team without admin_ids has no member count', () => {
    expect(TeamSchema.parse(transformTeam({ id: 1, name: 'x' })).memberCount).toBeUndefined()
  })
})
