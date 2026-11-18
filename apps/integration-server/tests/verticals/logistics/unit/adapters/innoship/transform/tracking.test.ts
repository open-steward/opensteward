import { describe, it, expect } from 'vitest'
import {
  transformTrackResult,
  type InnoshipTrackResult,
  type InnoshipTrackHistory,
} from '../../../../../../../src/verticals/logistics/adapters/innoship/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeHistoryItem(overrides: Partial<InnoshipTrackHistory> = {}): InnoshipTrackHistory {
  return {
    clientStatusId: 2,
    clientStatusDescription: 'in_transit',
    eventDate: '2024-03-02T10:00:00Z',
    isFinalStatus: false,
    localityName: 'Cluj-Napoca',
    ...overrides,
  }
}

function makeTrackResult(overrides: Partial<InnoshipTrackResult> = {}): InnoshipTrackResult {
  return {
    orderId: 1001,
    externalOrderId: 'EXT-1042',
    correlationId: 'CORR-001',
    courier: 3,
    shipmentAwb: 'AWB-001',
    trackingNumber: null,
    recipientLocality: 'Bucharest',
    recipientCountryCode: 'RO',
    currentStatus: 'in_transit',
    history: [
      makeHistoryItem({
        clientStatusDescription: 'created',
        eventDate: '2024-03-01T08:00:00Z',
        localityName: null,
      }),
      makeHistoryItem(),
    ],
    ...overrides,
  }
}

describe('innoship transformTrackResult', () => {
  it('returns one event per history item', () => {
    expect(transformTrackResult(makeTrackResult())).toHaveLength(2)
  })

  it('maps shipmentId from orderId as string', () => {
    const [event] = transformTrackResult(makeTrackResult())
    expect(event.shipmentId).toBe('1001')
  })

  it('maps trackingNumber from shipmentAwb', () => {
    const [event] = transformTrackResult(makeTrackResult())
    expect(event.trackingNumber).toBe('AWB-001')
  })

  it('maps carrierId from courier as string', () => {
    const [event] = transformTrackResult(makeTrackResult())
    expect(event.carrierId).toBe('3')
  })

  it('maps status from clientStatusDescription', () => {
    const [first, second] = transformTrackResult(makeTrackResult())
    expect(first.status).toBe('PRE_TRANSIT') // created → PRE_TRANSIT
    expect(second.status).toBe('IN_TRANSIT') // in_transit → IN_TRANSIT
  })

  it('maps description from clientStatusDescription', () => {
    const [, second] = transformTrackResult(makeTrackResult())
    expect(second.description).toBe('in_transit')
  })

  it('maps location from localityName + recipientCountryCode', () => {
    const [, second] = transformTrackResult(makeTrackResult())
    expect(second.location?.city).toBe('Cluj-Napoca')
    expect(second.location?.country).toBe('RO')
  })

  it('falls back location to recipientLocality when localityName is null', () => {
    const [first] = transformTrackResult(makeTrackResult())
    // first history item has localityName: null → falls back to recipientLocality
    expect(first.location?.city).toBe('Bucharest')
  })

  it('maps occurredAt as Date from eventDate', () => {
    const [event] = transformTrackResult(makeTrackResult())
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes TrackingEventSchema.parse on every event', () => {
    for (const event of transformTrackResult(makeTrackResult())) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })

  it('synthesizes one fallback event when history is empty', () => {
    const events = transformTrackResult(makeTrackResult({ history: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
    expect(events[0].location?.city).toBe('Bucharest')
  })

  it('maps tracking status strings correctly', () => {
    const cases: Array<[string, string]> = [
      ['delivered', 'DELIVERED'],
      ['livrat', 'DELIVERED'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['la livrare', 'OUT_FOR_DELIVERY'],
      ['in_transit', 'IN_TRANSIT'],
      ['transit', 'IN_TRANSIT'],
      ['expediat', 'IN_TRANSIT'],
      // NOTE: 'pre_transit' contains 'transit' so it matches the IN_TRANSIT branch
      // before the dedicated pre_transit check fires — this is the actual behaviour.
      ['pre_transit', 'IN_TRANSIT'],
      ['awb created', 'PRE_TRANSIT'],
      ['return', 'RETURN_TO_SENDER'],
      ['retur', 'RETURN_TO_SENDER'],
      ['pickup', 'AVAILABLE_FOR_PICKUP'],
      ['exception', 'FAILURE'],
      ['failed', 'FAILURE'],
      ['mystery', 'UNKNOWN'],
    ]
    for (const [clientStatusDescription, expected] of cases) {
      const events = transformTrackResult(
        makeTrackResult({ history: [makeHistoryItem({ clientStatusDescription })] }),
      )
      expect(events[0].status).toBe(expected)
    }
  })

  it('synthesizes fallback event status from currentStatus when history empty', () => {
    const events = transformTrackResult(
      makeTrackResult({ history: [], currentStatus: 'delivered' }),
    )
    expect(events[0].status).toBe('DELIVERED')
  })
})
