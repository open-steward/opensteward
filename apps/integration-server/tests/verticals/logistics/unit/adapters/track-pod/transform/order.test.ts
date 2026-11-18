import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  buildNewOrder,
  type TrackPodOrder,
} from '../../../../../../../src/verticals/logistics/adapters/track-pod/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<TrackPodOrder> = {}): TrackPodOrder {
  return {
    Id: 'ord-001',
    Number: 'ORD-001',
    TrackId: 'TRK-001',
    Date: '2024-03-01T00:00:00Z',
    Status: 'in progress',
    ContactName: 'Alice Smith',
    Phone: '+15555555555',
    Email: 'alice@example.com',
    Address: '1 Main St, Springfield',
    Note: 'Leave at door',
    ...overrides,
  }
}

describe('track-pod transformOrder', () => {
  it('maps Id → id', () => {
    const r = transformOrder(makeOrder())
    expect(r.id).toBe('ord-001')
  })

  it('falls back to TrackId when Id is absent', () => {
    const r = transformOrder(makeOrder({ Id: null }))
    expect(r.id).toBe('TRK-001')
  })

  it('maps Number → orderNumber', () => {
    const r = transformOrder(makeOrder())
    expect(r.orderNumber).toBe('ORD-001')
  })

  it('maps "in progress" → SHIPPED', () => {
    const r = transformOrder(makeOrder())
    expect(r.status).toBe('SHIPPED')
  })

  it('maps ContactName → destinationAddress.name', () => {
    const r = transformOrder(makeOrder())
    expect(r.destinationAddress?.name).toBe('Alice Smith')
  })

  it('maps Address → destinationAddress.street1', () => {
    const r = transformOrder(makeOrder())
    expect(r.destinationAddress?.street1).toBe('1 Main St, Springfield')
  })

  it('maps Note → notes', () => {
    const r = transformOrder(makeOrder())
    expect(r.notes).toBe('Leave at door')
  })

  it('maps Date → orderAt as Date', () => {
    const r = transformOrder(makeOrder())
    expect(r.orderAt).toBeInstanceOf(Date)
  })

  it('maps status values correctly', () => {
    const cases: Array<[string, string]> = [
      ['delivered', 'DELIVERED'],
      ['collected', 'DELIVERED'],
      ['not delivered', 'RETURNED'],
      ['not collected', 'RETURNED'],
      ['rejected', 'RETURNED'],
      ['partially', 'SHIPPED'],
      ['in progress', 'SHIPPED'],
      ['active', 'SHIPPED'],
      ['unscheduled', 'PENDING'],
      ['pending', 'PENDING'],
      ['scheduled', 'AWAITING_SHIPMENT'],
      ['cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
      ['bogus', 'PROCESSING'],
    ]
    for (const [s, expected] of cases) {
      expect(transformOrder(makeOrder({ Status: s })).status, `status: ${s}`).toBe(expected)
    }
  })

  it('metadata references the raw object', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('passes OrderSchema validation', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('handles null optional fields', () => {
    const r = transformOrder(makeOrder({ Note: null, Date: null, ContactName: null }))
    expect(r.notes).toBeUndefined()
    expect(r.orderAt).toBeUndefined()
    expect(() => OrderSchema.parse(r)).not.toThrow()
  })
})

describe('track-pod buildNewOrder', () => {
  it('maps orderNumber → Number', () => {
    const r = buildNewOrder({ orderNumber: 'ORD-999' })
    expect(r.Number).toBe('ORD-999')
  })

  it('maps notes → Note', () => {
    const r = buildNewOrder({ notes: 'Fragile' })
    expect(r.Note).toBe('Fragile')
  })

  it('maps destinationAddress fields', () => {
    const r = buildNewOrder({
      destinationAddress: {
        name: 'Bob',
        phone: '+15551234567',
        email: 'bob@example.com',
        street1: '42 Oak Lane',
      },
    })
    expect(r.ContactName).toBe('Bob')
    expect(r.Phone).toBe('+15551234567')
    expect(r.Email).toBe('bob@example.com')
    expect(r.Address).toBe('42 Oak Lane')
  })
})
