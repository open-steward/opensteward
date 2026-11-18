import { describe, it, expect } from 'vitest'
import {
  transformAwbTrace,
  transformDeltaEvents,
} from '../../../../../../../src/verticals/logistics/adapters/cargus/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { documentedDeltaAwb, documentedTracePackage } from '../fixtures/documented'

describe('cargus transformAwbTrace (documented NoAuth_GetAwbTrace)', () => {
  const packages = [
    documentedTracePackage('1000000001001', [
      ['2026-09-20T10:00:00Z', 1, 'Preluat de curier'],
      ['2026-09-21T08:00:00Z', 21, 'Livrat'],
    ]),
  ]

  it('every event parses against TrackingEventSchema', () => {
    for (const e of transformAwbTrace(packages, '1000000001')) {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    }
  })

  it('maps Date, Description and LocalityName; status UNKNOWN (EventId values undocumented)', () => {
    const [first] = transformAwbTrace(packages, '1000000001').map((e) =>
      TrackingEventSchema.parse(e),
    )
    expect(first!.trackingNumber).toBe('1000000001')
    expect(first!.shipmentId).toBe('1000000001')
    expect(first!.occurredAt?.toISOString()).toBe('2026-09-20T10:00:00.000Z')
    expect(first!.description).toBe('Preluat de curier')
    expect(first!.location).toEqual({ city: 'Bucuresti', state: undefined })
    expect(first!.status).toBe('UNKNOWN')
  })

  it('builds deterministic ids from barcode, package code, EventId and Date', () => {
    const ids = transformAwbTrace(packages, '1000000001').map((e) => e.id)
    expect(ids).toEqual([
      '1000000001:1000000001001:1:2026-09-20T10:00:00Z',
      '1000000001:1000000001001:21:2026-09-21T08:00:00Z',
    ])
  })

  it('an unparseable Date leaves occurredAt unset instead of inventing one', () => {
    const [e] = transformAwbTrace(
      [documentedTracePackage('P', [['not a date', 1, 'x']])],
      '1000000001',
    )
    expect(e!.occurredAt).toBeUndefined()
  })

  it('no packages means no events: nothing synthetic', () => {
    expect(transformAwbTrace([], '1000000001')).toEqual([])
  })
})

describe('cargus transformDeltaEvents (documented AwbTrace_GetDeltaEvents)', () => {
  const awbs = [
    documentedDeltaAwb('1000000001', [
      { code: 'P1', events: [['2026-09-20T10:00:00Z', 1, 'Preluat']] },
      { code: 'P2', events: [['2026-09-20T11:00:00Z', 1, 'Preluat']] },
    ]),
    documentedDeltaAwb('1000000002', [{ code: 'P3', events: [] }]),
  ]

  it('flattens every package event of every AWB, each parsing against TrackingEventSchema', () => {
    const events = transformDeltaEvents(awbs).map((e) => TrackingEventSchema.parse(e))
    expect(events.map((e) => e.id)).toEqual([
      '1000000001:P1:1:2026-09-20T10:00:00Z',
      '1000000001:P2:1:2026-09-20T11:00:00Z',
    ])
    expect(events[0]!.location).toEqual({ city: 'Cluj-Napoca', state: 'Cluj' })
  })

  it('throws on an AWB without a BarCode rather than emitting an id-less event', () => {
    expect(() => transformDeltaEvents([{ ...awbs[0]!, BarCode: null }])).toThrow(/BarCode/)
  })
})
