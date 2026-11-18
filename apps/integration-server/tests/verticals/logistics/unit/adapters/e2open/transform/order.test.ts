import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type E2openOrderRaw,
} from '../../../../../../../src/verticals/logistics/adapters/e2open/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeRaw(o: Partial<E2openOrderRaw> = {}): E2openOrderRaw {
  return {
    orderId: 'e2o-ord-001',
    orderNumber: 'ORD-E2O-001',
    status: 'SHIPPED',
    createdDate: '2024-03-01T00:00:00Z',
    updatedDate: '2024-03-01T12:00:00Z',
    origin: {
      name: 'Origin Warehouse',
      street1: '1 Depot Rd',
      city: 'Chicago',
      state: 'IL',
      country: 'US',
    },
    destination: {
      name: 'Customer',
      street1: '5 Delivery Ln',
      city: 'Detroit',
      state: 'MI',
      country: 'US',
    },
    ...o,
  }
}

describe('e2open transformOrder', () => {
  it('maps orderId to id', () => {
    expect(transformOrder(makeRaw()).id).toBe('e2o-ord-001')
  })

  it('maps orderNumber', () => {
    expect(transformOrder(makeRaw()).orderNumber).toBe('ORD-E2O-001')
  })

  it('SHIPPED → SHIPPED', () => {
    expect(transformOrder(makeRaw()).status).toBe('SHIPPED')
  })

  it('PENDING → PENDING', () => {
    expect(transformOrder(makeRaw({ status: 'PENDING' })).status).toBe('PENDING')
  })

  it('PROCESSING → PROCESSING', () => {
    expect(transformOrder(makeRaw({ status: 'PROCESSING' })).status).toBe('PROCESSING')
  })

  it('ON_HOLD → ON_HOLD', () => {
    expect(transformOrder(makeRaw({ status: 'ON_HOLD' })).status).toBe('ON_HOLD')
  })

  it('AWAITING_SHIPMENT → AWAITING_SHIPMENT', () => {
    expect(transformOrder(makeRaw({ status: 'AWAITING_SHIPMENT' })).status).toBe(
      'AWAITING_SHIPMENT',
    )
  })

  it('DELIVERED → DELIVERED', () => {
    expect(transformOrder(makeRaw({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('CANCELLED → CANCELLED', () => {
    expect(transformOrder(makeRaw({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('RETURNED → RETURNED', () => {
    expect(transformOrder(makeRaw({ status: 'RETURNED' })).status).toBe('RETURNED')
  })

  it('unknown status → UNKNOWN', () => {
    expect(transformOrder(makeRaw({ status: 'BOGUS' })).status).toBe('UNKNOWN')
  })

  it('absent status → UNKNOWN', () => {
    expect(transformOrder(makeRaw({ status: undefined })).status).toBe('UNKNOWN')
  })

  it('maps origin to originAddress', () => {
    const result = transformOrder(makeRaw())
    expect(result.originAddress?.city).toBe('Chicago')
    expect(result.originAddress?.state).toBe('IL')
  })

  it('maps destination to destinationAddress', () => {
    const result = transformOrder(makeRaw())
    expect(result.destinationAddress?.city).toBe('Detroit')
    expect(result.destinationAddress?.state).toBe('MI')
  })

  it('parses createdAt as Date', () => {
    expect(transformOrder(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('parses updatedAt as Date', () => {
    expect(transformOrder(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  it('passes OrderSchema validation', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})
