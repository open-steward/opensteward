/**
 * Fixture: Packlink's own API response fixture for
 * GET v1/shipments/{reference}/track, verbatim from
 * packlink-dev/ecommerce_module_core
 * tests/BusinessLogic/Common/ApiResponses/tracking.json. The same repo's
 * src/BusinessLogic/Http/DTO/Tracking.php reads only history[].timestamp,
 * .description and .city.
 */
import { describe, it, expect } from 'vitest'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import {
  transformTracking,
  type PacklinkProTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/packlink-pro/transform/tracking'

const DOC_BODY: PacklinkProTrackingResponse = {
  history: [
    { timestamp: 14242322, description: 'DELIVERED', city: 'MIAMI' },
    { timestamp: 14124132, description: 'DESTINATION SCAN', city: 'MIAMI' },
    { timestamp: 12424312, description: 'ARRIVAL SCAN', city: 'MIAMI' },
  ],
}

describe('Packlink PRO transformTracking', () => {
  it('maps every history entry and parses against TrackingEventSchema', () => {
    const events = transformTracking(DOC_BODY, 'DE00019732CF').map((e) =>
      TrackingEventSchema.parse(e),
    )
    expect(events.map((e) => e.description)).toEqual([
      'DELIVERED',
      'DESTINATION SCAN',
      'ARRIVAL SCAN',
    ])
    expect(events.every((e) => e.shipmentId === 'DE00019732CF')).toBe(true)
    expect(events.every((e) => e.location?.city === 'MIAMI')).toBe(true)
  })

  it('builds deterministic, distinct ids from the reference and timestamp', () => {
    const ids = transformTracking(DOC_BODY, 'REF1').map((e) => e.id)
    expect(ids).toEqual(['REF1:14242322:0', 'REF1:14124132:0', 'REF1:12424312:0'])
    expect(transformTracking(DOC_BODY, 'REF1').map((e) => e.id)).toEqual(ids)
  })

  it('keeps existing ids stable when a newer event is prepended to the newest-first history', () => {
    const before = transformTracking(DOC_BODY, 'REF1').map((e) => e.id)
    const after = transformTracking(
      {
        history: [
          { timestamp: 14300000, description: 'RETURNED', city: 'MIAMI' },
          ...DOC_BODY.history!,
        ],
      },
      'REF1',
    ).map((e) => e.id)
    expect(after).toEqual(['REF1:14300000:0', ...before])
  })

  it('separates entries that share a timestamp', () => {
    const ids = transformTracking(
      {
        history: [
          { timestamp: 1, description: 'A' },
          { timestamp: 1, description: 'B' },
        ],
      },
      'REF1',
    ).map((e) => e.id)
    expect(ids).toEqual(['REF1:1:0', 'REF1:1:1'])
  })

  it('invents no occurredAt (timestamp unit undocumented), status, carrier or tracking number', () => {
    const [e] = transformTracking(DOC_BODY, 'REF1')
    expect(e!.occurredAt).toBeUndefined()
    expect(e!.status).toBeUndefined()
    expect(e!.carrierId).toBeUndefined()
    expect(e!.trackingNumber).toBeUndefined()
    expect(e!.metadata).toEqual({ timestamp: 14242322, description: 'DELIVERED', city: 'MIAMI' })
  })

  it('returns no events when history is absent, as the first-party DTO does', () => {
    expect(transformTracking({}, 'REF1')).toEqual([])
  })
})
