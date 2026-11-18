import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../../src/verticals/logistics/adapters/stamps/client', () => ({
  StampsClient: class {
    get = getMock
  },
}))

import {
  transformTrackingEvents,
  type SeraTrackingEvent,
  type SeraTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/stamps/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { StampsAdapter } from '../../../../../../../src/verticals/logistics/adapters/stamps'
import type { Credentials } from '../../../../../../../src/verticals/logistics/adapter/interface'

/**
 * SERA's `GET /v1/tracking` returns a single OBJECT (tracking_number,
 * carrier_name, status_code, destination, tracking_events[]) — not a bare
 * array of events. Each entry of `tracking_events[]` has its location fields
 * flat (city/state_province/postal_code/country_code) and a carrier-specific
 * `carrier_status_code`; the shipment-level `status_code` is the fallback
 * when an event has none. See developer.stamps.com/rest-api/reference/serav1.html.
 */

const TRACKING_NUM = '9400111899223397643730'

function makeEvent(overrides: Partial<SeraTrackingEvent> = {}): SeraTrackingEvent {
  return {
    occurred_at: '2024-01-15T11:00:00Z',
    event_description: 'Package departed facility',
    city: 'San Francisco',
    state_province: 'CA',
    postal_code: '94105',
    country_code: 'US',
    signed_by: null,
    carrier_status_code: 'in_transit',
    ...overrides,
  }
}

function makeResponse(overrides: Partial<SeraTrackingResponse> = {}): SeraTrackingResponse {
  return {
    tracking_number: TRACKING_NUM,
    carrier_name: 'usps',
    status_code: 'in_transit',
    destination: {
      city: 'Oakland',
      state_province: 'CA',
      postal_code: '94612',
      country_code: 'US',
    },
    tracking_events: [makeEvent()],
    ...overrides,
  }
}

// ─── transformTrackingEvents ─────────────────────────────────────────────────

describe('stamps transformTrackingEvents', () => {
  it('maps event fields to a canonical event, reading the flat location keys', () => {
    const [event] = transformTrackingEvents(makeResponse(), TRACKING_NUM)

    expect(event.trackingNumber).toBe(TRACKING_NUM)
    expect(event.carrierId).toBe('usps')
    expect(event.description).toBe('Package departed facility')
    expect(event.occurredAt).toEqual(new Date('2024-01-15T11:00:00Z'))
    expect(event.location?.city).toBe('San Francisco')
    expect(event.location?.state).toBe('CA')
    expect(event.location?.postalCode).toBe('94105')
    expect(event.location?.country).toBe('US')
  })

  it('produces one TrackingEvent per tracking_events[] entry', () => {
    const raw = makeResponse({
      tracking_events: [makeEvent(), makeEvent({ carrier_status_code: 'delivered' })],
    })
    expect(transformTrackingEvents(raw, TRACKING_NUM)).toHaveLength(2)
  })

  it('takes status from the per-event carrier_status_code over the top-level status_code', () => {
    const raw = makeResponse({
      status_code: 'in_transit',
      tracking_events: [makeEvent({ carrier_status_code: 'delivered' })],
    })
    expect(transformTrackingEvents(raw, TRACKING_NUM)[0].status).toBe('DELIVERED')
  })

  it('falls back to the top-level status_code when an event has no carrier_status_code', () => {
    const raw = makeResponse({
      status_code: 'delivered',
      tracking_events: [makeEvent({ carrier_status_code: null })],
    })
    expect(transformTrackingEvents(raw, TRACKING_NUM)[0].status).toBe('DELIVERED')
  })

  it('maps the documented status_code enum values', () => {
    expect(
      transformTrackingEvents(
        makeResponse({ status_code: 'awaiting_shipment', tracking_events: [] }),
        TRACKING_NUM,
      )[0].status,
    ).toBe('PRE_TRANSIT')
    expect(
      transformTrackingEvents(
        makeResponse({ status_code: 'exception', tracking_events: [] }),
        TRACKING_NUM,
      )[0].status,
    ).toBe('FAILURE')
    expect(
      transformTrackingEvents(
        makeResponse({ status_code: 'accepted', tracking_events: [] }),
        TRACKING_NUM,
      )[0].status,
    ).toBe('IN_TRANSIT')
  })

  it('maps an unrecognized status_code to UNKNOWN, not a thrown error', () => {
    const raw = makeResponse({ status_code: 'not_a_real_code', tracking_events: [] })
    expect(transformTrackingEvents(raw, TRACKING_NUM)[0].status).toBe('UNKNOWN')
  })

  it('matches carrier_status_code by keyword, the way the other carrier-code adapters do', () => {
    expect(
      transformTrackingEvents(
        makeResponse({ tracking_events: [makeEvent({ carrier_status_code: 'OUT_FOR_DELIVERY' })] }),
        TRACKING_NUM,
      )[0].status,
    ).toBe('OUT_FOR_DELIVERY')
    expect(
      transformTrackingEvents(
        makeResponse({ tracking_events: [makeEvent({ carrier_status_code: 'RTS - Return to sender' })] }),
        TRACKING_NUM,
      )[0].status,
    ).toBe('RETURN_TO_SENDER')
  })

  it('falls back to a single summary event built from the top-level fields when tracking_events is empty', () => {
    const raw = makeResponse({ tracking_events: [], status_code: 'awaiting_shipment' })
    const events = transformTrackingEvents(raw, TRACKING_NUM)
    expect(events).toHaveLength(1)
    expect(events[0].trackingNumber).toBe(TRACKING_NUM)
    expect(events[0].carrierId).toBe('usps')
    expect(events[0].status).toBe('PRE_TRANSIT')
  })

  it('falls back to a single summary event when tracking_events is null', () => {
    const raw = makeResponse({ tracking_events: null })
    expect(transformTrackingEvents(raw, TRACKING_NUM)).toHaveLength(1)
  })

  it('falls back to the argument tracking number when the response omits tracking_number', () => {
    const raw = makeResponse({ tracking_number: undefined as unknown as string })
    expect(transformTrackingEvents(raw, TRACKING_NUM)[0].trackingNumber).toBe(TRACKING_NUM)
  })

  it('leaves description undefined when event_description is null', () => {
    const raw = makeResponse({ tracking_events: [makeEvent({ event_description: null })] })
    expect(transformTrackingEvents(raw, TRACKING_NUM)[0].description).toBeUndefined()
  })

  it('leaves location undefined when the event has no location fields', () => {
    const raw = makeResponse({
      tracking_events: [
        makeEvent({ city: null, state_province: null, postal_code: null, country_code: null }),
      ],
    })
    expect(transformTrackingEvents(raw, TRACKING_NUM)[0].location).toBeUndefined()
  })

  it('preserves the raw event as metadata, by reference', () => {
    const evt = makeEvent()
    const raw = makeResponse({ tracking_events: [evt] })
    expect(transformTrackingEvents(raw, TRACKING_NUM)[0].metadata).toBe(evt)
  })

  it('produces output the canonical schema accepts', () => {
    for (const event of transformTrackingEvents(makeResponse(), TRACKING_NUM)) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })

  it('parses a sparse response too', () => {
    const raw: SeraTrackingResponse = {
      tracking_number: TRACKING_NUM,
      carrier_name: null,
      status_code: 'accepted',
      destination: null,
      tracking_events: null,
    }
    const [event] = transformTrackingEvents(raw, TRACKING_NUM)
    expect(TrackingEventSchema.safeParse(event).success).toBe(true)
  })
})

// ─── StampsAdapter#getTrackingEvents (request pin) ───────────────────────────

describe('StampsAdapter getTrackingEvents', () => {
  const credentials = { accessToken: 'TEST_token' } as Credentials
  const adapter = new StampsAdapter()

  beforeEach(() => {
    getMock.mockReset()
  })

  it('requests GET /v1/tracking with tracking_number — not the old versionless /tracking path', async () => {
    getMock.mockResolvedValueOnce(makeResponse())

    await adapter.getTrackingEvents(credentials, TRACKING_NUM)

    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock).toHaveBeenCalledWith('/v1/tracking', { tracking_number: TRACKING_NUM })
  })

  it('returns canonical events parsed from the object response, not an empty array', async () => {
    getMock.mockResolvedValueOnce(makeResponse())

    const events = await adapter.getTrackingEvents(credentials, TRACKING_NUM)

    expect(events).toHaveLength(1)
    expect(events[0].trackingNumber).toBe(TRACKING_NUM)
    for (const e of events) expect(() => TrackingEventSchema.parse(e)).not.toThrow()
  })
})
