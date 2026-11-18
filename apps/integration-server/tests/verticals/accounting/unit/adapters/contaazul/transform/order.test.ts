import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type ContaAzulOrder } from '../../../../../../../src/verticals/accounting/adapters/contaazul/transform/order'

function makeOrder(overrides: Partial<ContaAzulOrder> = {}): ContaAzulOrder {
  return {
    id: 'ord-001',
    customer_id: 'cust-300',
    currency: 'BRL',
    total: 20000,
    date: '2025-04-01',
    status: 'completed',
    shipping_address: 'Av Paulista 1000',
    shipping_city: 'Sao Paulo',
    shipping_state: 'SP',
    shipping_postal_code: '01310-100',
    shipping_country: 'BR',
    billing_address: 'Rua Faria Lima 500',
    billing_city: 'Sao Paulo',
    billing_state: 'SP',
    billing_postal_code: '04538-000',
    billing_country: 'BR',
    items: [
      { id: 'li-1', description: 'Produto B', quantity: 4, unit_price: 5000, total: 20000, tax_amount: 3600, product_id: 'prod-2', discount: 0 },
    ],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ord-001')
    expect(result.type).toBe('SALES')
    expect(result.contactId).toBe('cust-300')
    expect(result.currency).toBe('BRL')
    expect(result.totalAmount).toBe(20000)
  })

  it('maps status values', () => {
    expect(transformOrder(makeOrder({ status: 'completed' })).status).toBe('COMPLETED')
    expect(transformOrder(makeOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
    expect(transformOrder(makeOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps shipping and billing addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress?.city).toBe('Sao Paulo')
    expect(result.billingAddress?.address1).toBe('Rua Faria Lima 500')
  })

  it('returns undefined addresses when empty', () => {
    const result = transformOrder(makeOrder({ shipping_address: '', shipping_city: '', billing_address: '', billing_city: '' }))
    expect(result.shippingAddress).toBeUndefined()
    expect(result.billingAddress).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
