import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  type DualentrySalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/dualentry/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makeRaw(overrides: Partial<DualentrySalesOrder> = {}): DualentrySalesOrder {
  return {
    id: 500,
    internal_id: 500,
    number: 7001,
    date: '2024-08-01',
    created_at: '2024-08-01T09:00:00Z',
    updated_at: '2024-08-10T12:00:00Z',
    company_id: 1,
    company_name: 'My Company',
    company_currency: 'EUR',
    customer_id: 10,
    customer_name: 'Acme Corp',
    currency_iso_4217_code: 'EUR',
    exchange_rate: '1.00',
    amount: '800.00',
    invoiced_total: null,
    due_total: null,
    memo: 'Annual contract',
    reference_number: 'SO-2024-001',
    record_status: 'posted',
    invoiced_status: 'uninvoiced',
    approval_status: null,
    billing_address: {
      street: '123 Main St',
      second_line: null,
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      country: 'US',
    },
    shipping_address: null,
    items: [],
    ...overrides,
  }
}

describe('dualentry transformSalesOrder', () => {
  it('maps id to string', () => {
    const result = transformSalesOrder(makeRaw({ id: 33 }))
    expect(result.id).toBe('33')
  })

  it('maps customer_id with cust_ prefix to contactId', () => {
    const result = transformSalesOrder(makeRaw({ customer_id: 10 }))
    expect(result.contactId).toBe('cust_10')
  })

  it('archived → CANCELLED', () => {
    const result = transformSalesOrder(makeRaw({ record_status: 'archived' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('invoiced_status=invoiced → COMPLETED', () => {
    const result = transformSalesOrder(makeRaw({ invoiced_status: 'invoiced' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('posted → ACTIVE', () => {
    const result = transformSalesOrder(
      makeRaw({ record_status: 'posted', invoiced_status: 'uninvoiced' }),
    )
    expect(result.status).toBe('ACTIVE')
  })

  it('amount string → minor units', () => {
    const result = transformSalesOrder(makeRaw({ amount: '25.00' }))
    expect(result.totalAmount).toBe(2500)
  })

  it('maps billing_address street', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.billingAddress?.address1).toBe('123 Main St')
  })

  it('maps created_at to createdAt as Date', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes SalesOrderSchema.parse without throwing', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
