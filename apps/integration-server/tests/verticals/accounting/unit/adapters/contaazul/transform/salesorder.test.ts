import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type ContaAzulSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/contaazul/transform/salesorder'

function makeSalesOrder(overrides: Partial<ContaAzulSalesOrder> = {}): ContaAzulSalesOrder {
  return {
    id: 'so-001',
    customer_id: 'cust-400',
    currency: 'BRL',
    total: 30000,
    date: '2025-07-10',
    status: 'invoiced',
    shipping_address: 'Rua Sul 200',
    shipping_city: 'Curitiba',
    shipping_state: 'PR',
    shipping_postal_code: '80000-000',
    shipping_country: 'BR',
    billing_address: 'Av Norte 300',
    billing_city: 'Curitiba',
    billing_state: 'PR',
    billing_postal_code: '80001-000',
    billing_country: 'BR',
    items: [
      { id: 'li-1', description: 'Produto Y', quantity: 10, unit_price: 3000, total: 30000, tax_amount: 5400, product_id: 'py-1', discount: 0 },
    ],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('so-001')
    expect(result.contactId).toBe('cust-400')
    expect(result.currency).toBe('BRL')
    expect(result.totalAmount).toBe(30000)
  })

  it('maps status values', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'completed' })).status).toBe('COMPLETED')
    expect(transformSalesOrder(makeSalesOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
    expect(transformSalesOrder(makeSalesOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps shipping and billing addresses', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.shippingAddress?.city).toBe('Curitiba')
    expect(result.billingAddress?.region).toBe('PR')
  })

  it('passes raw object as metadata', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
