import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type PplCzOrder,
} from '../../../../../../../src/verticals/logistics/adapters/ppl-cz/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

describe('transformOrder', () => {
  it('maps orderId to id and referenceId to orderNumber', () => {
    const raw: PplCzOrder = {
      orderId: 'ORD-CZ-001',
      referenceId: 'REF-001',
      status: 'Submitted',
    }
    const result = transformOrder(raw)
    expect(result.id).toBe('ORD-CZ-001')
    expect(result.orderNumber).toBe('REF-001')
  })

  it('maps status strings to canonical OrderStatus', () => {
    expect(transformOrder({ status: 'Submitted' }).status).toBe('PROCESSING')
    expect(transformOrder({ status: 'Confirmed' }).status).toBe('AWAITING_SHIPMENT')
    expect(transformOrder({ status: 'Completed' }).status).toBe('SHIPPED')
    expect(transformOrder({ status: 'Cancelled' }).status).toBe('CANCELLED')
    expect(transformOrder({ status: 'Unknown' }).status).toBe('PENDING')
  })

  it('maps shipmentNumbers to shipmentIds', () => {
    const raw: PplCzOrder = {
      shipmentNumbers: ['41000000001', '41000000002'],
    }
    const result = transformOrder(raw)
    expect(result.shipmentIds).toEqual(['41000000001', '41000000002'])
  })

  it('maps sender address correctly', () => {
    const raw: PplCzOrder = {
      sender: {
        name: 'Acme CZ',
        street: 'Wenceslas Square 1',
        city: 'Prague',
        zipCode: '11000',
        country: 'CZ',
      },
    }
    const result = transformOrder(raw)
    expect(result.originAddress?.name).toBe('Acme CZ')
    expect(result.originAddress?.city).toBe('Prague')
    expect(result.originAddress?.postalCode).toBe('11000')
    expect(result.originAddress?.country).toBe('CZ')
  })

  it('maps note to notes', () => {
    const result = transformOrder({ note: 'Call before delivery' })
    expect(result.notes).toBe('Call before delivery')
  })

  it('passes schema parse', () => {
    const raw: PplCzOrder = {
      orderId: 'ORD-CZ-002',
      referenceId: 'REF-002',
      status: 'Confirmed',
      sender: { name: 'Test Co', city: 'Brno', zipCode: '60200', country: 'CZ' },
      shipmentNumbers: ['41000000010'],
      createdAt: '2024-03-01T00:00:00Z',
      updatedAt: '2024-03-01T00:00:00Z',
    }
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
