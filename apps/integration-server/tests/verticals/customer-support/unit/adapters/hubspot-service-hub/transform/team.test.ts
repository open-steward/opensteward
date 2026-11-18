/**
 * HubSpot Service Hub team transform.
 *
 * One transform handles two different HubSpot response shapes:
 *   - `PublicTeam` from GET /settings/v3/users/teams (listTeams) — has
 *     userIds/secondaryUserIds, no parentTeamId.
 *   - `TeamResponse` from GET /settings/teams/2026-09/{teamId} (getTeam) —
 *     has parentTeamId, no member lists.
 * Both refer to the same HubSpot team id, so a single transform round-trips
 * either shape.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawHubspotTeam,
} from '../../../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('hubspot-service-hub transformTeam — listTeams shape (PublicTeam)', () => {
  const raw: RawHubspotTeam = {
    id: '12345',
    name: 'Support Tier 1',
    userIds: [1, 2, 3],
    secondaryUserIds: [4],
  }

  it('maps id, externalId and name', () => {
    const result = transformTeam(raw)
    expect(result.id).toBe('12345')
    expect(result.externalId).toBe('12345')
    expect(result.name).toBe('Support Tier 1')
  })

  it('derives member counts from the userId arrays', () => {
    const result = transformTeam(raw)
    expect(result.metadata['primaryMemberCount']).toBe('3')
    expect(result.metadata['secondaryMemberCount']).toBe('1')
  })

  it('produces a TeamSchema-valid result', () => {
    expect(() => TeamSchema.parse(transformTeam(raw))).not.toThrow()
  })
})

describe('hubspot-service-hub transformTeam — getTeam shape (TeamResponse, 2026-09)', () => {
  const raw: RawHubspotTeam = {
    id: '12345',
    name: 'Support Tier 1',
    parentTeamId: '999',
  }

  it('maps the same id/externalId/name as the list shape', () => {
    const result = transformTeam(raw)
    expect(result.id).toBe('12345')
    expect(result.externalId).toBe('12345')
    expect(result.name).toBe('Support Tier 1')
  })

  it('has no member counts in metadata (2026-09 getTeam has no member lists)', () => {
    const result = transformTeam(raw)
    expect(result.metadata['primaryMemberCount']).toBeUndefined()
    expect(result.metadata['secondaryMemberCount']).toBeUndefined()
  })

  it('places parentTeamId in metadata', () => {
    expect(transformTeam(raw).metadata['parentTeamId']).toBe('999')
  })

  it('produces a TeamSchema-valid result', () => {
    expect(() => TeamSchema.parse(transformTeam(raw))).not.toThrow()
  })

  it('handles missing name — falls back to empty string', () => {
    const minimal = { id: '7' } as RawHubspotTeam
    const result = transformTeam(minimal)
    expect(result.name).toBe('')
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })
})
