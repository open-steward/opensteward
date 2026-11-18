import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type Locate2uOrder,
} from '../../../../../../../src/verticals/logistics/adapters/locate2u/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(o: Partial<Locate2uOrder> = {}): Locate2uOrder {
  return {
    shipmentId: 1001,
    status: 'inprogress',
    shipmentRef: 'LOC-REF-001',
    contact: { name: 'Alice Smith', phone: '+15125550200', email: 'alice@example.com' },
    tripDate: '2024-03-01T00:00:00Z',
    lastModifiedDate: '2024-03-01T00:00:00Z',
    notes: 'Ring doorbell',
    customerId: 42,
    pickupStop: {
      address: '10 Pickup Lane',
      contact: { name: 'Depot', phone: '+15125550300' },
    },
    dropStop: {
      address: '20 Dropoff Ave',
      contact: { name: 'Alice Smith', phone: '+15125550200' },
    },
    ...o,
  }
}

describe('locate2u transformOrder', () => {
  it('maps shipmentId to id as string', () => {
    expect(transformOrder(makeOrder()).id).toBe('1001')
  })

  it('maps shipmentRef to orderNumber', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('LOC-REF-001')
  })

  it('maps inprogress status to AWAITING_SHIPMENT', () => {
    expect(transformOrder(makeOrder({ status: 'inprogress' })).status).toBe('AWAITING_SHIPMENT')
  })

  it('maps pending status to PENDING', () => {
    expect(transformOrder(makeOrder({ status: 'pending' })).status).toBe('PENDING')
  })

  it('maps assigned status to PROCESSING', () => {
    expect(transformOrder(makeOrder({ status: 'assigned' })).status).toBe('PROCESSING')
  })

  it('maps completed status to DELIVERED', () => {
    expect(transformOrder(makeOrder({ status: 'completed' })).status).toBe('DELIVERED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformOrder(makeOrder({ status: 'bogus_status' })).status).toBe('UNKNOWN')
  })

  it('maps customerId to string', () => {
    expect(transformOrder(makeOrder()).customerId).toBe('42')
  })

  it('maps pickupStop address to originAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.street1).toBe('10 Pickup Lane')
    expect(result.originAddress?.name).toBe('Depot')
  })

  it('maps dropStop address to destinationAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.street1).toBe('20 Dropoff Ave')
  })

  it('falls back to order-level contact when stop contact absent', () => {
    const result = transformOrder(makeOrder({ dropStop: { address: '20 Dropoff Ave' } }))
    expect(result.destinationAddress?.name).toBe('Alice Smith')
  })

  it('maps notes', () => {
    expect(transformOrder(makeOrder()).notes).toBe('Ring doorbell')
  })

  it('maps tripDate to createdAt Date', () => {
    expect(transformOrder(makeOrder()).createdAt).toBeInstanceOf(Date)
  })

  it('maps lastModifiedDate to updatedAt Date', () => {
    expect(transformOrder(makeOrder()).updatedAt).toBeInstanceOf(Date)
  })

  it('originAddress undefined when pickupStop absent', () => {
    expect(transformOrder(makeOrder({ pickupStop: undefined })).originAddress).toBeUndefined()
  })

  it('attaches metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('validates against OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
