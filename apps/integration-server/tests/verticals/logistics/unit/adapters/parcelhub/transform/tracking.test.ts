import { describe, it, expect } from 'vitest'
import {
  assertServiceResult,
  transformTrackingHistory,
} from '../../../../../../../src/verticals/logistics/adapters/parcelhub/transform/tracking'
import { parseXml } from '../../../../../../../src/verticals/logistics/adapters/parcelhub/xml'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { TRACKING_HISTORY_XML } from '../fixtures'

function withEvent(category: string, sub: string, timestamp = '2025-04-08T09:21:48'): string {
  return TRACKING_HISTORY_XML.replace(
    /<PackageTrackingEvents>[\s\S]*<\/PackageTrackingEvents>/,
    `<PackageTrackingEvents><TrackingEvent><EventCategoryID>${category}</EventCategoryID><EventSubCategoryID>${sub}</EventSubCategoryID><EventDescription>x</EventDescription><EventTimestamp>${timestamp}</EventTimestamp></TrackingEvent></PackageTrackingEvents>`,
  )
}

describe('Parcelhub transformTrackingHistory (POST /v1/trackingservice/gettrackinghistory)', () => {
  it('maps the documented Get Tracking History example to schema-valid events', () => {
    const events = transformTrackingHistory(parseXml(TRACKING_HISTORY_XML)).map((e) =>
      TrackingEventSchema.parse(e),
    )
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      shipmentId: 'NDAzMzA5NTEw',
      trackingNumber: 'L10054111000002661',
      description: 'Shipment Deleted',
      status: 'UNKNOWN',
    })
    expect(events[1]).toMatchObject({ description: 'Shipment Created', status: 'PRE_TRANSIT' })
    expect(events[0]?.metadata).toMatchObject({
      courierName: 'Whistl',
      eventSubCategoryDescription: 'Shipment deleted',
      eventTimestamp: '2025-04-08T09:21:48',
      courierTrackingEventCode: 'T2SD',
    })
  })

  it('does not guess a zone for a zone-less EventTimestamp', () => {
    const [evt] = transformTrackingHistory(parseXml(TRACKING_HISTORY_XML))
    expect(evt?.occurredAt).toBeUndefined()
  })

  it('reads an EventTimestamp that carries its own offset', () => {
    const [evt] = transformTrackingHistory(
      parseXml(withEvent('3', '13', '2025-04-08T09:21:48+01:00')),
    )
    expect(evt?.occurredAt?.toISOString()).toBe('2025-04-08T08:21:48.000Z')
  })

  it('maps categories from the Tracking Event List appendix', () => {
    const cases: Array<[string, string, string]> = [
      ['1', '1', 'DELIVERED'],
      ['1', '47', 'AVAILABLE_FOR_PICKUP'],
      ['1', '59', 'DELIVERED'],
      ['1', '83', 'RETURN_TO_SENDER'],
      ['2', '8', 'IN_TRANSIT'],
      ['3', '13', 'IN_TRANSIT'],
      ['3', '17', 'OUT_FOR_DELIVERY'],
      ['3', '82', 'RETURN_TO_SENDER'],
      ['3', '88', 'RETURN_TO_SENDER'],
      ['3', '89', 'RETURN_TO_SENDER'],
      ['4', '21', 'FAILURE'],
      ['4', '48', 'RETURN_TO_SENDER'],
      ['5', '31', 'UNKNOWN'],
      ['7', '54', 'PRE_TRANSIT'],
      ['7', '46', 'UNKNOWN'],
      ['8', '67', 'FAILURE'],
      ['99', '1', 'UNKNOWN'],
    ]
    for (const [cat, sub, want] of cases) {
      const [evt] = transformTrackingHistory(parseXml(withEvent(cat, sub)))
      expect(TrackingEventSchema.parse(evt).status, `${cat}/${sub}`).toBe(want)
    }
  })

  it('includes shipment-level events with the response tracking number', () => {
    const xml = TRACKING_HISTORY_XML.replace(
      '<ShipmentTrackingEvents />',
      '<ShipmentTrackingEvents><TrackingEvent><EventCategoryID>1</EventCategoryID><EventSubCategoryID>1</EventSubCategoryID><EventDescription>Delivered</EventDescription></TrackingEvent></ShipmentTrackingEvents>',
    )
    const events = transformTrackingHistory(parseXml(xml))
    expect(events).toHaveLength(3)
    expect(events[0]).toMatchObject({ status: 'DELIVERED', trackingNumber: 'L10054111000002661' })
  })

  it('gives package events the package TrackingNumber, not the response one', () => {
    const xml = TRACKING_HISTORY_XML.replace(
      /<Package>(\s*)<TrackingNumber>L10054111000002661<\/TrackingNumber>/,
      '<Package>$1<TrackingNumber>PKG0000000002</TrackingNumber>',
    )
    expect(xml).toContain('PKG0000000002')
    const events = transformTrackingHistory(parseXml(xml))
    expect(events.map((e) => e.trackingNumber)).toEqual(['PKG0000000002', 'PKG0000000002'])
  })

  it('returns no events for an empty history, never a synthetic one', () => {
    const xml = TRACKING_HISTORY_XML.replace(
      /<PackageTrackingEvents>[\s\S]*<\/PackageTrackingEvents>/,
      '<PackageTrackingEvents />',
    )
    expect(transformTrackingHistory(parseXml(xml))).toEqual([])
  })

  it('throws the documented ServiceResult error', () => {
    const xml = TRACKING_HISTORY_XML.replace('<Success>true</Success>', '<Success>false</Success>')
      .replace('<ErrorCode>0</ErrorCode>', '<ErrorCode>12</ErrorCode>')
      .replace('<ErrorMessage />', '<ErrorMessage>Invalid access code</ErrorMessage>')
    expect(() => assertServiceResult(parseXml(xml))).toThrow(
      'Parcelhub Tracking API error 12: Invalid access code',
    )
    expect(() => assertServiceResult(parseXml(TRACKING_HISTORY_XML))).not.toThrow()
  })
})
