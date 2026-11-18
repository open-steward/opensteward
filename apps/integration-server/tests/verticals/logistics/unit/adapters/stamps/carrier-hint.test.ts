import { describe, it, expect, vi, afterEach } from 'vitest'
import { StampsAdapter } from '../../../../../../src/verticals/logistics/adapters/stamps'
import { StampsClient } from '../../../../../../src/verticals/logistics/adapters/stamps/client'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'

/**
 * SERA's `GET /v1/tracking` accepts an optional `carrier` alongside
 * `tracking_number`, to disambiguate numbers that collide across carriers.
 * `LogisticsAdapter#getTrackingEvents` had nowhere to carry one, so stamps
 * always omitted it and a colliding number resolved to whichever carrier SERA
 * picked.
 *
 * The hint is optional on the interface, which is what keeps this a two-file
 * change rather than a 315-adapter one: an implementation that ignores a
 * parameter it never declares is still structurally compatible, so no other
 * adapter is touched.
 */

const CREDS = { accessToken: 'tok' } as Credentials

function stubGet() {
  return vi
    .spyOn(StampsClient.prototype, 'get')
    .mockResolvedValue({ tracking_events: [] } as never)
}

afterEach(() => vi.restoreAllMocks())

describe('stamps getTrackingEvents carrier hint', () => {
  it('forwards the carrier to SERA when one is supplied', async () => {
    const get = stubGet()
    await new StampsAdapter().getTrackingEvents(CREDS, '9400111899223197428490', 'usps')
    expect(get).toHaveBeenCalledWith('/v1/tracking', {
      tracking_number: '9400111899223197428490',
      carrier: 'usps',
    })
  })

  it('omits the carrier entirely when none is supplied', async () => {
    // Sending `carrier: undefined` is not the same as omitting it — a query
    // serialiser may emit an empty value, which SERA would read as a filter on
    // the empty carrier rather than no filter.
    const get = stubGet()
    await new StampsAdapter().getTrackingEvents(CREDS, '9400111899223197428490')
    expect(get).toHaveBeenCalledWith('/v1/tracking', {
      tracking_number: '9400111899223197428490',
    })
    const params = get.mock.calls[0]?.[1] as Record<string, unknown>
    expect('carrier' in params).toBe(false)
  })

  it('ignores a blank carrier rather than sending an empty filter', async () => {
    const get = stubGet()
    await new StampsAdapter().getTrackingEvents(CREDS, '9400111899223197428490', '   ')
    const params = get.mock.calls[0]?.[1] as Record<string, unknown>
    expect('carrier' in params).toBe(false)
  })
})
