import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type UnifiedShippingShipment,
} from '../../../../../../../src/verticals/logistics/adapters/unified-to-shipping/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<UnifiedShippingShipment> = {}): UnifiedShippingShipment {
  return {
    id: 'SHP-U-001',
    status: 'IN_TRANSIT',
    trackingId: 'TRK-U-001',
    carrierId: 'usps',
    serviceCode: 'PRIORITY',
    rateAmount: 1295,
    rateCurrency: 'USD',
    rateEstimatedDeliveryAt: '2024-03-05T00:00:00Z',
    referenceNumber: 'REF-001',
    warehouseLocationId: 'WH-U-001',
    fromAddress: {
      name: 'Alice',
      address1: '1 Sender Lane',
      city: 'Portland',
      region: 'OR',
      postalCode: '97201',
      countryCode: 'US',
    },
    toAddress: {
      name: 'Bob',
      address1: '2 Receiver St',
      city: 'Seattle',
      region: 'WA',
      postalCode: '98101',
      countryCode: 'US',
    },
    packages: [
      {
        trackingNumber: 'PKG-TRK-001',
        weight: 2.5,
        weightUnit: 'lb',
        length: 12,
        width: 8,
        height: 4,
        sizeUnit: 'in',
      },
    ],
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('unified-to-shipping transformShipment', () => {
  it('maps id', () => {
    expect(transformShipment(makeShipment()).id).toBe('SHP-U-001')
  })

  it('maps status IN_TRANSIT', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps status PENDING', () => {
    expect(transformShipment(makeShipment({ status: 'PENDING' })).status).toBe('PENDING')
  })

  it('maps status LABEL_CREATED', () => {
    expect(transformShipment(makeShipment({ status: 'LABEL_CREATED' })).status).toBe(
      'LABEL_CREATED',
    )
  })

  it('maps PROCESSING to LABEL_CREATED', () => {
    // mapShipmentStatus: 'PROCESSING' → 'LABEL_CREATED'
    expect(transformShipment(makeShipment({ status: 'PROCESSING' })).status).toBe('LABEL_CREATED')
  })

  it('maps DELIVERED status', () => {
    expect(transformShipment(makeShipment({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps RETURNED_TO_SENDER to RETURNED', () => {
    expect(transformShipment(makeShipment({ status: 'RETURNED_TO_SENDER' })).status).toBe(
      'RETURNED',
    )
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformShipment(makeShipment({ status: 'NOPE' })).status).toBe('UNKNOWN')
  })

  it('maps trackingNumber from trackingId', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('TRK-U-001')
  })

  it('maps carrierId', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('usps')
  })

  it('maps serviceCode', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('PRIORITY')
  })

  it('maps originAddress from fromAddress', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.city).toBe('Portland')
    expect(result.originAddress?.state).toBe('OR')
    expect(result.originAddress?.country).toBe('US')
  })

  it('maps destinationAddress from toAddress', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.city).toBe('Seattle')
    expect(result.destinationAddress?.postalCode).toBe('98101')
  })

  it('maps totalWeight from first package', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('lb')
  })

  it('maps dimensions from first package', () => {
    const result = transformShipment(makeShipment())
    expect(result.dimensions?.length).toBe(12)
    expect(result.dimensions?.width).toBe(8)
    expect(result.dimensions?.height).toBe(4)
    expect(result.dimensions?.unit).toBe('in')
  })

  it('maps cost from rateAmount (stored as-is)', () => {
    const result = transformShipment(makeShipment())
    expect(result.cost?.amount).toBe(1295)
    expect(result.cost?.currency).toBe('USD')
  })

  it('maps reference from referenceNumber', () => {
    expect(transformShipment(makeShipment()).reference).toBe('REF-001')
  })

  it('maps warehouseId from warehouseLocationId', () => {
    expect(transformShipment(makeShipment()).warehouseId).toBe('WH-U-001')
  })

  it('maps estimatedDeliveryAt as Date', () => {
    expect(transformShipment(makeShipment()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformShipment(makeShipment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes metadata through', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })
})
