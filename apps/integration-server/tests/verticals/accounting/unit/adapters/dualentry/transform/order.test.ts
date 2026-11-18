import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/accounting/adapters/dualentry/transform/order'
import type { DualentrySalesOrder } from '../../../../../../../src/verticals/accounting/adapters/dualentry/transform/salesorder'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeRaw(overrides: Partial<DualentrySalesOrder> = {}): DualentrySalesOrder {
  return {
    id: 300,
    internal_id: 300,
    number: 4001,
    date: '2024-06-01',
    created_at: '2024-06-01T08:00:00Z',
    updated_at: '2024-06-01T08:00:00Z',
    company_id: 1,
    company_name: 'My Company',
    company_currency: 'EUR',
    customer_id: 10,
    customer_name: 'Acme Corp',
    currency_iso_4217_code: 'EUR',
    exchange_rate: '1.00',
    amount: '500.00',
    invoiced_total: '0.00',
    due_total: '500.00',
    memo: 'Q2 order',
    reference_number: 'SO-001',
    record_status: 'posted',
    invoiced_status: 'uninvoiced',
    approval_status: null,
    billing_address: null,
    shipping_address: null,
    items: [],
    ...overrides,
  }
}

describe('dualentry transformOrder', () => {
  it('maps id to string', () => {
    const result = transformOrder(makeRaw({ id: 99 }))
    expect(result.id).toBe('99')
  })

  it('type is always SALES', () => {
    const result = transformOrder(makeRaw())
    expect(result.type).toBe('SALES')
  })

  it('maps customer_id with cust_ prefix to contactId', () => {
    const result = transformOrder(makeRaw({ customer_id: 10 }))
    expect(result.contactId).toBe('cust_10')
  })

  it('archived → CANCELLED', () => {
    const result = transformOrder(makeRaw({ record_status: 'archived' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('invoiced_status=invoiced → COMPLETED', () => {
    const result = transformOrder(makeRaw({ invoiced_status: 'invoiced' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('posted → ACTIVE', () => {
    const result = transformOrder(
      makeRaw({ record_status: 'posted', invoiced_status: 'uninvoiced' }),
    )
    expect(result.status).toBe('ACTIVE')
  })

  it('amount string → minor units', () => {
    const result = transformOrder(makeRaw({ amount: '10.00' }))
    expect(result.totalAmount).toBe(1000)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes OrderSchema.parse without throwing', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
