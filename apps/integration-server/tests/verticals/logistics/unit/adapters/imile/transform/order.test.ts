import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type IMileOrder,
} from '../../../../../../../src/verticals/logistics/adapters/imile/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<IMileOrder> = {}): IMileOrder {
  return {
    orderId: 'order-001',
    orderNo: 'ORD-1042',
    status: 'IN_TRANSIT',
    senderAddress: {
      name: 'Alice',
      addressLine1: '1 Sender St',
      city: 'Dubai',
      countryCode: 'AE',
    },
    receiverAddress: {
      name: 'Bob',
      addressLine1: '2 Receiver Ave',
      city: 'Abu Dhabi',
      countryCode: 'AE',
    },
    waybillNos: ['WB-001', 'WB-002'],
    currency: 'AED',
    createdTime: '2024-03-01T00:00:00Z',
    updatedTime: '2024-03-01T08:00:00Z',
    ...overrides,
  }
}

describe('imile transformOrder', () => {
  it('maps id from orderId', () => {
    expect(transformOrder(makeOrder()).id).toBe('order-001')
  })

  it('maps orderNumber from orderNo', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('ORD-1042')
  })

  it('maps status IN_TRANSIT → SHIPPED', () => {
    expect(transformOrder(makeOrder({ status: 'IN_TRANSIT' })).status).toBe('SHIPPED')
  })

  it('maps shipmentIds from waybillNos', () => {
    expect(transformOrder(makeOrder()).shipmentIds).toEqual(['WB-001', 'WB-002'])
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('AED')
  })

  it('maps createdAt and updatedAt as Dates', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps originAddress from senderAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.name).toBe('Alice')
    expect(result.originAddress?.city).toBe('Dubai')
  })

  it('maps destinationAddress from receiverAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.name).toBe('Bob')
    expect(result.destinationAddress?.city).toBe('Abu Dhabi')
  })

  it('passes OrderSchema.parse without throwing', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })

  it('handles null addresses', () => {
    const result = transformOrder(makeOrder({ senderAddress: null, receiverAddress: null }))
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })

  it('maps status codes to canonical OrderStatus values', () => {
    const cases: Array<[string | number, string]> = [
      ['PENDING', 'PENDING'],
      ['CREATED', 'PENDING'],
      [0, 'PENDING'],
      ['PROCESSING', 'PROCESSING'],
      [1, 'PROCESSING'],
      ['AWAITING_SHIPMENT', 'AWAITING_SHIPMENT'],
      ['LABEL_CREATED', 'AWAITING_SHIPMENT'],
      ['SHIPPED', 'SHIPPED'],
      ['DELIVERED', 'DELIVERED'],
      [5, 'DELIVERED'],
      ['CANCELLED', 'CANCELLED'],
      ['CANCELED', 'CANCELLED'],
      [7, 'CANCELLED'],
      ['RETURNED', 'RETURNED'],
      [6, 'RETURNED'],
    ]
    for (const [status, expected] of cases) {
      expect(transformOrder(makeOrder({ status })).status).toBe(expected)
    }
  })

  it('sets shipmentIds to undefined when waybillNos is empty', () => {
    const result = transformOrder(makeOrder({ waybillNos: [] }))
    expect(result.shipmentIds).toBeUndefined()
  })
})
