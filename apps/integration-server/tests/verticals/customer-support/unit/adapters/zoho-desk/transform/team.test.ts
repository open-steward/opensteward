/**
 * Fixtures are the GET /api/v1/teams/{team_id} and GET /api/v1/teams response
 * examples (https://desk.zoho.com/DeskAPIDocument, Teams).
 */
import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawZohoDeskTeam,
} from '../../../../../../../src/verticals/customer-support/adapters/zoho-desk/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema'

const GET_TEAM: RawZohoDeskTeam = {
  rolesWithSubordinates: ['6000000008684', '6000000008686'],
  departmentId: '6000000009893',
  roles: ['6000000011311', '6000000011307'],
  name: 'Sales Reps.',
  description: 'Sales teams for winning customers.',
  derivedAgents: ['6000000009086', '6000000012003'],
  id: '6000000014007',
  subTeams: ['6000000011303'],
  logoUrl: null,
  agents: ['6000000009086'],
}

describe('transformTeam', () => {
  it('maps the documented get-team example, counting distinct members', () => {
    const t = TeamSchema.parse(transformTeam(GET_TEAM))
    expect(t).toMatchObject({
      id: '6000000014007',
      externalId: '6000000014007',
      name: 'Sales Reps.',
      memberCount: 2,
      platform: 'zoho-desk',
    })
    expect(t.metadata).toEqual({
      departmentId: '6000000009893',
      description: 'Sales teams for winning customers.',
    })
  })

  it('an empty team (list example) has zero members', () => {
    const t = TeamSchema.parse(
      transformTeam({
        departmentId: '17000000007253',
        name: 'Engineering',
        derivedAgents: [],
        id: '17000000013001',
        agents: [],
      }),
    )
    expect(t.memberCount).toBe(0)
  })

  it('leaves memberCount out when no member list was sent', () => {
    expect(TeamSchema.parse(transformTeam({ id: '1' })).memberCount).toBeUndefined()
  })
})
