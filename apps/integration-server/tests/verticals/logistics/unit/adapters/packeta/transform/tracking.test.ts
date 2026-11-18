import { describe, it, expect } from 'vitest'
import { parseTrackingXml } from '../../../../../../../src/verticals/logistics/adapters/packeta/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

const BARCODE = 'Z1234567890'

/** Build a minimal <step> XML fragment. */
function makeStepXml(fields: {
  statusCode?: string
  statusText?: string
  dateTime?: string
  description?: string
  branchName?: string
  country?: string
}): string {
  const tags = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join('\n      ')
  return `<step>\n      ${tags}\n    </step>`
}

/** Wrap one or more <step> fragments in a full <packetTracking> response. */
function makeTrackingXml(...steps: string[]): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<packetTracking>
  <status>ok</status>
  <result>
    <steps>
      ${steps.join('\n      ')}
    </steps>
  </result>
</packetTracking>`
}

describe('parseTrackingXml', () => {
  it('returns one TrackingEvent per <step> element', () => {
    const xml = makeTrackingXml(
      makeStepXml({ statusCode: '4', dateTime: '2024-03-15T10:30:00Z', description: 'In transit' }),
      makeStepXml({
        statusCode: '7',
        dateTime: '2024-03-16T08:00:00Z',
        description: 'Out for delivery',
      }),
    )
    const events = parseTrackingXml(xml, BARCODE)
    expect(events).toHaveLength(2)
  })

  it('sets trackingNumber and carrierId on every event', () => {
    const xml = makeTrackingXml(makeStepXml({ statusCode: '4', dateTime: '2024-03-15T10:30:00Z' }))
    const event = parseTrackingXml(xml, BARCODE)[0]

    expect(event.trackingNumber).toBe(BARCODE)
    expect(event.carrierId).toBe('packeta')
  })

  it('maps statusCode "4" to IN_TRANSIT', () => {
    const xml = makeTrackingXml(makeStepXml({ statusCode: '4', dateTime: '2024-03-15T10:30:00Z' }))
    expect(parseTrackingXml(xml, BARCODE)[0].status).toBe('IN_TRANSIT')
  })

  it('maps statusCode "5" to DELIVERED', () => {
    const xml = makeTrackingXml(makeStepXml({ statusCode: '5', dateTime: '2024-03-16T12:00:00Z' }))
    expect(parseTrackingXml(xml, BARCODE)[0].status).toBe('DELIVERED')
  })

  it('maps statusCode "1" to PRE_TRANSIT', () => {
    const xml = makeTrackingXml(makeStepXml({ statusCode: '1', dateTime: '2024-03-14T09:00:00Z' }))
    expect(parseTrackingXml(xml, BARCODE)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps statusCode "2" to AVAILABLE_FOR_PICKUP', () => {
    const xml = makeTrackingXml(makeStepXml({ statusCode: '2', dateTime: '2024-03-14T10:00:00Z' }))
    expect(parseTrackingXml(xml, BARCODE)[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps statusCode "3" to AVAILABLE_FOR_PICKUP', () => {
    const xml = makeTrackingXml(makeStepXml({ statusCode: '3', dateTime: '2024-03-14T11:00:00Z' }))
    expect(parseTrackingXml(xml, BARCODE)[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps statusCode "7" to OUT_FOR_DELIVERY', () => {
    const xml = makeTrackingXml(makeStepXml({ statusCode: '7', dateTime: '2024-03-16T08:00:00Z' }))
    expect(parseTrackingXml(xml, BARCODE)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps statusCode "6" to RETURN_TO_SENDER', () => {
    const xml = makeTrackingXml(makeStepXml({ statusCode: '6', dateTime: '2024-03-17T09:00:00Z' }))
    expect(parseTrackingXml(xml, BARCODE)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps statusCode "8" to FAILURE', () => {
    const xml = makeTrackingXml(makeStepXml({ statusCode: '8', dateTime: '2024-03-17T10:00:00Z' }))
    expect(parseTrackingXml(xml, BARCODE)[0].status).toBe('FAILURE')
  })

  it('maps statusCode "9" to FAILURE', () => {
    const xml = makeTrackingXml(makeStepXml({ statusCode: '9', dateTime: '2024-03-17T11:00:00Z' }))
    expect(parseTrackingXml(xml, BARCODE)[0].status).toBe('FAILURE')
  })

  it('maps unknown statusCode to UNKNOWN', () => {
    const xml = makeTrackingXml(makeStepXml({ statusCode: '99', dateTime: '2024-03-17T12:00:00Z' }))
    expect(parseTrackingXml(xml, BARCODE)[0].status).toBe('UNKNOWN')
  })

  it('maps description and statusText into the description field (description takes priority)', () => {
    const xml = makeTrackingXml(
      makeStepXml({
        statusCode: '4',
        statusText: 'In transit',
        description: 'Parcel is in transit',
        dateTime: '2024-03-15T10:30:00Z',
      }),
    )
    expect(parseTrackingXml(xml, BARCODE)[0].description).toBe('Parcel is in transit')
  })

  it('falls back to statusText when description is absent', () => {
    const xml = makeTrackingXml(
      makeStepXml({ statusCode: '4', statusText: 'In transit', dateTime: '2024-03-15T10:30:00Z' }),
    )
    expect(parseTrackingXml(xml, BARCODE)[0].description).toBe('In transit')
  })

  it('maps branchName to location.city', () => {
    const xml = makeTrackingXml(
      makeStepXml({
        statusCode: '4',
        dateTime: '2024-03-15T10:30:00Z',
        branchName: 'Prague Depot',
        country: 'CZ',
      }),
    )
    const event = parseTrackingXml(xml, BARCODE)[0]

    expect(event.location?.city).toBe('Prague Depot')
    expect(event.location?.country).toBe('CZ')
  })

  it('parses dateTime into a Date for occurredAt', () => {
    const xml = makeTrackingXml(makeStepXml({ statusCode: '4', dateTime: '2024-03-15T10:30:00Z' }))
    const event = parseTrackingXml(xml, BARCODE)[0]

    expect(event.occurredAt).toBeInstanceOf(Date)
    expect((event.occurredAt as Date).toISOString()).toBe('2024-03-15T10:30:00.000Z')
  })

  it('sets location to undefined when neither branchName nor country is present', () => {
    const xml = makeTrackingXml(
      makeStepXml({ statusCode: '4', dateTime: '2024-03-15T10:30:00Z', description: 'In transit' }),
    )
    const event = parseTrackingXml(xml, BARCODE)[0]

    expect(event.location).toBeUndefined()
  })

  it('returns a single fallback event when no <step> elements are present', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<packetTracking>
  <status>ok</status>
  <result>
    <statusCode>1</statusCode>
  </result>
</packetTracking>`
    const events = parseTrackingXml(xml, BARCODE)

    expect(events).toHaveLength(1)
    expect(events[0].trackingNumber).toBe(BARCODE)
    expect(events[0].carrierId).toBe('packeta')
    expect(events[0].status).toBe('PRE_TRANSIT')
  })

  it('produces output that satisfies TrackingEventSchema for each event', () => {
    const xml = makeTrackingXml(
      makeStepXml({
        statusCode: '4',
        statusText: 'In transit',
        dateTime: '2024-03-15T10:30:00Z',
        description: 'Parcel is in transit',
        branchName: 'Prague Depot',
        country: 'CZ',
      }),
    )
    const events = parseTrackingXml(xml, BARCODE)
    for (const event of events) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
