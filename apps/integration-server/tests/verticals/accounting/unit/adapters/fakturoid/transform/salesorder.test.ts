import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type FakturoidSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/fakturoid/transform/salesorder'

function makeSalesOrder(overrides: Partial<FakturoidSalesOrder> = {}): FakturoidSalesOrder {
  return {
    id: 3001,
    number: 'SO-2024-001',
    subject_id: 88,
    status: 'open',
    issued_on: '2024-01-15',
    total: 8000,
    currency: 'EUR',
    vat_price: 1600,
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (fakturoid)', () => {
  it('maps id and core fields', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('3001')
    expect(result.contactId).toBe('88')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(8000)
  })

  it('maps issued_on to postedAt as Date', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status "completed" to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status "invoiced" to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status "cancelled" to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status "draft" to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps line items correctly', () => {
    const raw = makeSalesOrder({
      lines: [
        {
          id: 30,
          name: 'Service',
          quantity: 3,
          unit_price: 1000,
          vat_rate: 21,
          unit_price_without_vat: 1000,
          unit_price_with_vat: 1210,
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('30')
    expect(li.itemDescription).toBe('Service')
    expect(li.totalAmount).toBe(3630)
  })

  it('sets metadata to the raw object by reference', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
