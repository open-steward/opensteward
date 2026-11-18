import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type MelhorEnvioOrder,
} from '../../../../../../../src/verticals/logistics/adapters/melhor-envio/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<MelhorEnvioOrder> = {}): MelhorEnvioOrder {
  return {
    id: 'ord-101',
    protocol: 'PROTO-101',
    status: 'posted',
    tracking: 'BR987654321BR',
    service_id: 3,
    service_code: 'sedex',
    service: { id: 3, name: 'SEDEX' },
    company: { id: 1, name: 'Correios' },
    from: {
      name: 'Sender Name',
      address1: 'Rua A',
      city: 'São Paulo',
      state: 'SP',
      zip: '01310-100',
      country: 'BR',
    },
    to: {
      name: 'Recipient Name',
      address1: 'Rua B',
      city: 'Rio de Janeiro',
      state: 'RJ',
      zip: '20040-020',
      country: 'BR',
    },
    price: '29.90',
    discount: '5.00',
    products: [{ id: 'p1', name: 'Widget', quantity: 2, unitary_value: '10.00', weight: 0.5 }],
    paid_at: '2024-03-01T00:00:00Z',
    posted_at: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (melhor-envio)', () => {
  it('maps id as string', () => {
    expect(transformOrder(makeOrder()).id).toBe('ord-101')
  })

  it('maps orderNumber from protocol', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('PROTO-101')
  })

  it('maps status SHIPPED for "posted" status', () => {
    expect(transformOrder(makeOrder()).status).toBe('SHIPPED')
  })

  it('maps status DELIVERED for "delivered"', () => {
    expect(transformOrder(makeOrder({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps status CANCELLED for "cancelado"', () => {
    expect(transformOrder(makeOrder({ status: 'cancelado' })).status).toBe('CANCELLED')
  })

  it('maps status PENDING for "pending_payment"', () => {
    expect(transformOrder(makeOrder({ status: 'pending_payment' })).status).toBe('PENDING')
  })

  it('maps shipmentIds from tracking number', () => {
    const result = transformOrder(makeOrder())
    expect(result.shipmentIds).toContain('BR987654321BR')
  })

  it('maps totalAmount as integer minor units from BRL decimal string', () => {
    // 29.90 BRL → 2990 cents
    expect(transformOrder(makeOrder()).totalAmount).toBe(2990)
  })

  it('maps discountAmount as integer minor units', () => {
    // 5.00 BRL → 500 cents
    expect(transformOrder(makeOrder()).discountAmount).toBe(500)
  })

  it('maps currency to BRL', () => {
    expect(transformOrder(makeOrder()).currency).toBe('BRL')
  })

  it('maps lineItems from products array', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].name).toBe('Widget')
    expect(result.lineItems![0].quantity).toBe(2)
    expect(result.lineItems![0].unitAmount).toBe(1000) // 10.00 × 100
  })

  it('maps requestedServiceCode from service_code', () => {
    expect(transformOrder(makeOrder()).requestedServiceCode).toBe('sedex')
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('produces an OrderSchema-valid result', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })
})
