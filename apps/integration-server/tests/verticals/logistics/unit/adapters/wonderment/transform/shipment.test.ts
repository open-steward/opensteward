import { describe, it, expect } from 'vitest'
import { transformShipment } from '../../../../../../../src/verticals/logistics/adapters/wonderment/transform/shipment'
import type { WondermentShipment } from '../../../../../../../src/verticals/logistics/adapters/wonderment/transform/tracking'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<WondermentShipment> = {}): WondermentShipment {
  return {
    id: 'wm_shp_001',
    trackingCode: 'TRACK123456',
    orderName: '#1042',
    carrierName: 'ups',
    carrierService: 'UPS_GROUND',
    packageEta: '2024-03-01T00:00:00Z',
    statusDetails: { status: 'IN_TRANSIT', substatus: null },
    events: [],
    ...overrides,
  }
}

// ─── Field mappings ───────────────────────────────────────────────────────────

describe('transformShipment — field mappings', () => {
  it('maps id from raw.id', () => {
    expect(transformShipment(makeRaw()).id).toBe('wm_shp_001')
  })

  it('maps trackingNumber from raw.trackingCode', () => {
    expect(transformShipment(makeRaw()).trackingNumber).toBe('TRACK123456')
  })

  it('falls back to raw.trackingNumber when trackingCode is absent', () => {
    const raw = makeRaw({ trackingCode: null, trackingNumber: 'TRK_FALLBACK' })
    expect(transformShipment(raw).trackingNumber).toBe('TRK_FALLBACK')
  })

  it('maps carrierId from raw.carrierName', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('ups')
  })

  it('maps serviceCode from raw.carrierService', () => {
    expect(transformShipment(makeRaw()).serviceCode).toBe('UPS_GROUND')
  })

  it('maps reference from raw.orderName', () => {
    expect(transformShipment(makeRaw()).reference).toBe('#1042')
  })

  it('falls back to raw.orderId when orderName is absent', () => {
    const raw = makeRaw({ orderName: null, orderId: 'ORD-999' })
    expect(transformShipment(raw).reference).toBe('ORD-999')
  })

  it('maps estimatedDeliveryAt from raw.packageEta as Date', () => {
    const result = transformShipment(makeRaw())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.estimatedDeliveryAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets estimatedDeliveryAt to undefined when packageEta is null', () => {
    expect(transformShipment(makeRaw({ packageEta: null })).estimatedDeliveryAt).toBeUndefined()
  })

  it('attaches raw as metadata', () => {
    const raw = makeRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})

// ─── Status mapping ───────────────────────────────────────────────────────────

describe('transformShipment — status mapping', () => {
  const status = (s: string | null) =>
    transformShipment(makeRaw({ statusDetails: { status: s, substatus: null } })).status

  it('maps IN_TRANSIT to IN_TRANSIT', () => {
    expect(status('IN_TRANSIT')).toBe('IN_TRANSIT')
  })

  it('maps TRANSIT to IN_TRANSIT', () => {
    expect(status('TRANSIT')).toBe('IN_TRANSIT')
  })

  it('maps OUT_FOR_DELIVERY to OUT_FOR_DELIVERY', () => {
    expect(status('OUT_FOR_DELIVERY')).toBe('OUT_FOR_DELIVERY')
  })

  it('maps DELIVERED to DELIVERED', () => {
    expect(status('DELIVERED')).toBe('DELIVERED')
  })

  it('maps RETURNED to RETURNED', () => {
    expect(status('RETURNED')).toBe('RETURNED')
  })

  it('maps SHIPMENT_CREATED to LABEL_CREATED', () => {
    expect(status('SHIPMENT_CREATED')).toBe('LABEL_CREATED')
  })

  it('maps CONFIRMED to LABEL_CREATED', () => {
    expect(status('CONFIRMED')).toBe('LABEL_CREATED')
  })

  it('maps PRE_TRANSIT to LABEL_CREATED', () => {
    expect(status('PRE_TRANSIT')).toBe('LABEL_CREATED')
  })

  it('maps ERROR to EXCEPTION', () => {
    expect(status('ERROR')).toBe('EXCEPTION')
  })

  it('maps ATTEMPTED_DELIVERY to EXCEPTION', () => {
    expect(status('ATTEMPTED_DELIVERY')).toBe('EXCEPTION')
  })

  it('maps SHIPMENT_STALLED to EXCEPTION', () => {
    expect(status('SHIPMENT_STALLED')).toBe('EXCEPTION')
  })

  it('maps CANCELLED to EXCEPTION', () => {
    expect(status('CANCELLED')).toBe('EXCEPTION')
  })

  it('maps null status to UNKNOWN', () => {
    expect(status(null)).toBe('UNKNOWN')
  })

  it('maps unrecognised status to UNKNOWN', () => {
    expect(status('SOMETHING_ELSE')).toBe('UNKNOWN')
  })

  it('is case-insensitive for status strings', () => {
    expect(status('delivered')).toBe('DELIVERED')
  })
})

// ─── Schema validation ────────────────────────────────────────────────────────

describe('transformShipment — schema validation', () => {
  it('passes ShipmentSchema for a typical in-transit shipment', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeRaw()))).not.toThrow()
  })

  it('passes ShipmentSchema when optional fields are absent', () => {
    const minimal: WondermentShipment = { statusDetails: { status: 'DELIVERED', substatus: null } }
    expect(() => ShipmentSchema.parse(transformShipment(minimal))).not.toThrow()
  })

  it('passes ShipmentSchema for every mapped status value', () => {
    const statuses = [
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'RETURNED',
      'PRE_TRANSIT',
      'ERROR',
      null,
    ]
    for (const s of statuses) {
      const raw = makeRaw({ statusDetails: { status: s, substatus: null } })
      expect(() => ShipmentSchema.parse(transformShipment(raw))).not.toThrow()
    }
  })
})
