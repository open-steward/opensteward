/**
 * hubspot-service-hub getTag / getTeam.
 *
 * Before this fix:
 *   - getTag always rejected (`no individual GET endpoint`) even though
 *     HubSpot's CRM Object Tags API can fetch one by id.
 *   - getTeam called GET /settings/v3/users/teams/{id}, a path that does not
 *     exist — the v3 Users/Teams API only has a bare list endpoint
 *     (/settings/v3/users/teams), never a /{id} route.
 *
 * These pin the corrected REQUESTs (method + exact path), not just the
 * transforms, since a wrong path/envelope is exactly what slipped through
 * transform-only coverage last time.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { HubspotServiceHubAdapter } from '../../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/index'
import { HubspotServiceHubClient } from '../../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/client'
import { TICKETS_OBJECT_TYPE_ID } from '../../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/constants'
import { TagSchema } from '../../../../../../src/verticals/customer-support/schema/tag'
import { TeamSchema } from '../../../../../../src/verticals/customer-support/schema/team'
import type { Credentials } from '../../../../../../src/verticals/customer-support/adapter/interface'

const adapter = new HubspotServiceHubAdapter({
  clientId: 'test-id',
  clientSecret: 'test-secret',
  redirectUri: 'http://localhost:3010/auth/customer-support/hubspot-service-hub/callback',
})

const creds = { accessToken: 'tok' } as Credentials

/** Spy on the shared client and record the path + params it was called with. */
function stubGet(payload: unknown) {
  return vi.spyOn(HubspotServiceHubClient.prototype, 'get').mockResolvedValue(payload as never)
}

afterEach(() => vi.restoreAllMocks())

describe('HubspotServiceHubAdapter.getTag', () => {
  it('calls GET /crm/object-tags/2026-09/{objectTypeId}/{tagId} with the tickets object type', async () => {
    const spy = stubGet({
      id: '4001',
      name: 'VIP customer',
      color: '#e53935',
      objectTypeId: '0-5',
    })

    const tag = await adapter.getTag!(creds, '4001')

    expect(TICKETS_OBJECT_TYPE_ID).toBe('0-5')
    expect(spy).toHaveBeenCalledWith('/crm/object-tags/2026-09/0-5/4001')
    expect(tag.id).toBe('4001')
    expect(tag.name).toBe('VIP customer')
    expect(() => TagSchema.parse(tag)).not.toThrow()
  })

  it('propagates an upstream failure rather than reporting "no individual GET endpoint"', async () => {
    vi.spyOn(HubspotServiceHubClient.prototype, 'get').mockRejectedValue(new Error('HubSpot 404'))
    await expect(adapter.getTag!(creds, 'missing')).rejects.toThrow('HubSpot 404')
  })
})

describe('HubspotServiceHubAdapter.getTeam', () => {
  it('calls GET /settings/teams/2026-09/{teamId}, not the nonexistent v3 path', async () => {
    const spy = stubGet({ id: '55', name: 'Escalations', parentTeamId: '10' })

    const team = await adapter.getTeam!(creds, '55')

    expect(spy).toHaveBeenCalledWith('/settings/teams/2026-09/55')
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('/settings/v3/users/teams/'))
    expect(team.id).toBe('55')
    expect(team.name).toBe('Escalations')
    expect(() => TeamSchema.parse(team)).not.toThrow()
  })

  it('propagates an upstream failure', async () => {
    vi.spyOn(HubspotServiceHubClient.prototype, 'get').mockRejectedValue(new Error('HubSpot 404'))
    await expect(adapter.getTeam!(creds, 'missing')).rejects.toThrow('HubSpot 404')
  })
})

describe('HubspotServiceHubAdapter.listTeams — unchanged by this fix', () => {
  it('still calls the v3 list endpoint (only the get-by-id path was broken)', async () => {
    const spy = stubGet({ results: [{ id: '55', name: 'Escalations' }] })
    await adapter.listTeams!(creds, {})
    expect(spy).toHaveBeenCalledWith('/settings/v3/users/teams')
  })
})
