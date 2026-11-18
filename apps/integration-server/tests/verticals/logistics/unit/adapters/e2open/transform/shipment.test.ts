import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type E2openShipmentRaw,
} from '../../../../../../../src/verticals/logistics/adapters/e2open/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(o: Partial<E2openShipmentRaw> = {}): E2openShipmentRaw {
  return {
    shipmentId: 'e2o-shp-001',
    referenceNumber: 'REF-001',
    trackingNumber: 'TRK-E2O-001',
    status: 'IN_TRANSIT',
    carrier: 'fedex',
    serviceType: 'fedex_ground',
    notes: 'Handle with care',
    createdDate: '2024-03-01T00:00:00Z',
    updatedDate: '2024-03-01T12:00:00Z',
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    origin: {
      name: 'Warehouse',
      street1: '1 Ship St',
      city: 'Houston',
      state: 'TX',
      country: 'US',
    },
    destination: {
      name: 'Recipient',
      street1: '2 Recv Ave',
      city: 'Miami',
      state: 'FL',
      country: 'US',
    },
    totalWeight: { value: 5.5, unit: 'LB' },
    cost: { amount: 1299, currency: 'USD' },
    ...o,
  }
}

describe('e2open transformShipment', () => {
  it('maps shipmentId to id', () => {
    expect(transformShipment(makeRaw()).id).toBe('e2o-shp-001')
  })

  it('maps trackingNumber', () => {
    expect(transformShipment(makeRaw()).trackingNumber).toBe('TRK-E2O-001')
  })

  it('falls back to referenceNumber when trackingNumber absent', () => {
    expect(transformShipment(makeRaw({ trackingNumber: undefined })).trackingNumber).toBe('REF-001')
  })

  it('IN_TRANSIT → IN_TRANSIT', () => {
    expect(transformShipment(makeRaw()).status).toBe('IN_TRANSIT')
  })

  it('PLANNED → PENDING', () => {
    expect(transformShipment(makeRaw({ status: 'PLANNED' })).status).toBe('PENDING')
  })

  it('BOOKED → LABEL_CREATED', () => {
    expect(transformShipment(makeRaw({ status: 'BOOKED' })).status).toBe('LABEL_CREATED')
  })

  it('OUT_FOR_DELIVERY → OUT_FOR_DELIVERY', () => {
    expect(transformShipment(makeRaw({ status: 'OUT_FOR_DELIVERY' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('DELIVERED → DELIVERED', () => {
    expect(transformShipment(makeRaw({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('EXCEPTION → EXCEPTION', () => {
    expect(transformShipment(makeRaw({ status: 'EXCEPTION' })).status).toBe('EXCEPTION')
  })

  it('RETURNED → RETURNED', () => {
    expect(transformShipment(makeRaw({ status: 'RETURNED' })).status).toBe('RETURNED')
  })

  it('CANCELLED → CANCELLED', () => {
    expect(transformShipment(makeRaw({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('unknown status → UNKNOWN', () => {
    expect(transformShipment(makeRaw({ status: 'UNKNOWN_STATE' })).status).toBe('UNKNOWN')
  })

  it('maps carrier to carrierId', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('fedex')
  })

  it('defaults carrierId to e2open when carrier absent', () => {
    expect(transformShipment(makeRaw({ carrier: undefined })).carrierId).toBe('e2open')
  })

  it('maps serviceType to serviceCode', () => {
    expect(transformShipment(makeRaw()).serviceCode).toBe('fedex_ground')
  })

  it('maps origin to originAddress', () => {
    const result = transformShipment(makeRaw())
    expect(result.originAddress?.city).toBe('Houston')
  })

  it('maps destination to destinationAddress', () => {
    const result = transformShipment(makeRaw())
    expect(result.destinationAddress?.city).toBe('Miami')
  })

  it('maps totalWeight value and unit lb', () => {
    const result = transformShipment(makeRaw())
    expect(result.totalWeight?.value).toBe(5.5)
    expect(result.totalWeight?.unit).toBe('lb')
  })

  it('maps totalWeight unit KG to kg', () => {
    const result = transformShipment(makeRaw({ totalWeight: { value: 3, unit: 'KG' } }))
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps cost amount', () => {
    expect(transformShipment(makeRaw()).cost?.amount).toBe(1299)
  })

  it('maps cost currency', () => {
    expect(transformShipment(makeRaw()).cost?.currency).toBe('USD')
  })

  it('maps notes', () => {
    expect(transformShipment(makeRaw()).notes).toBe('Handle with care')
  })

  it('parses createdAt as Date', () => {
    expect(transformShipment(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('parses estimatedDeliveryAt as Date', () => {
    expect(transformShipment(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
