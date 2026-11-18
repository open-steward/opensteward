import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type InnoshipOrder,
} from '../../../../../../../src/verticals/logistics/adapters/innoship/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<InnoshipOrder> = {}): InnoshipOrder {
  return {
    orderId: 1001,
    externalOrderId: 'EXT-1042',
    correlationId: 'CORR-001',
    courierId: 3,
    courierName: 'FAN Courier',
    shipmentAwb: 'AWB-001',
    trackingNumber: null,
    serviceId: 10,
    shipmentDate: '2024-03-01T00:00:00Z',
    addressFrom: {
      contactPerson: 'Alice',
      address1: '1 Origin St',
      city: 'Cluj-Napoca',
      county: 'Cluj',
      countryCode: 'RO',
    },
    addressTo: {
      contactPerson: 'Bob',
      address1: '2 Dest Ave',
      city: 'Bucharest',
      county: 'Ilfov',
      countryCode: 'RO',
    },
    parcels: [{ sequenceNo: 1, weight: 2.5, width: 20, height: 15, length: 30, awb: 'AWB-001' }],
    totalWeight: 2.5,
    currentStatus: 'in_transit',
    price: 22.0,
    currency: 'RON',
    createdDate: '2024-03-01T00:00:00Z',
    updatedDate: '2024-03-02T08:00:00Z',
    ...overrides,
  }
}

describe('innoship transformShipment', () => {
  it('maps id from orderId as string', () => {
    expect(transformShipment(makeShipment()).id).toBe('1001')
  })

  it('falls back id to correlationId when orderId is null', () => {
    const result = transformShipment(makeShipment({ orderId: null }))
    expect(result.id).toBe('CORR-001')
  })

  it('maps trackingNumber from shipmentAwb', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('AWB-001')
  })

  it('maps carrierId from courierId as string', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('3')
  })

  it('maps serviceCode from serviceId as string', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('10')
  })

  it('maps status in_transit → IN_TRANSIT', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps originAddress from addressFrom', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Alice')
    expect(result.originAddress?.city).toBe('Cluj-Napoca')
  })

  it('maps destinationAddress from addressTo', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.name).toBe('Bob')
    expect(result.destinationAddress?.city).toBe('Bucharest')
  })

  it('maps totalWeight from totalWeight in kg', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps cost from price and currency', () => {
    const result = transformShipment(makeShipment())
    expect(result.cost?.amount).toBe(22.0)
    expect(result.cost?.currency).toBe('RON')
  })

  it('maps reference from externalOrderId', () => {
    expect(transformShipment(makeShipment()).reference).toBe('EXT-1042')
  })

  it('maps createdAt and updatedAt as Dates', () => {
    const result = transformShipment(makeShipment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })

  it('maps ShipmentStatus values correctly', () => {
    const cases: Array<[string, string]> = [
      ['delivered', 'DELIVERED'],
      ['livrat', 'DELIVERED'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['la livrare', 'OUT_FOR_DELIVERY'],
      ['in_transit', 'IN_TRANSIT'],
      ['transit', 'IN_TRANSIT'],
      ['picked', 'IN_TRANSIT'],
      ['label', 'LABEL_CREATED'],
      ['created', 'LABEL_CREATED'],
      ['awb', 'LABEL_CREATED'],
      ['return', 'RETURNED'],
      ['retur', 'RETURNED'],
      ['cancel', 'CANCELLED'],
      ['exception', 'EXCEPTION'],
      ['incident', 'EXCEPTION'],
      ['pending', 'PENDING'],
      ['mystery', 'UNKNOWN'],
    ]
    for (const [currentStatus, expected] of cases) {
      expect(transformShipment(makeShipment({ currentStatus })).status).toBe(expected)
    }
  })

  it('omits cost when price is null', () => {
    expect(transformShipment(makeShipment({ price: null })).cost).toBeUndefined()
  })

  it('falls back totalWeight to first parcel weight when totalWeight is null', () => {
    const result = transformShipment(makeShipment({ totalWeight: null }))
    expect(result.totalWeight?.value).toBe(2.5)
  })
})
