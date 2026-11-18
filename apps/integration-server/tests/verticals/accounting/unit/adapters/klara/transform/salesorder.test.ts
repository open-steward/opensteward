import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  type KlaraSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/klara/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makeSalesOrder(overrides: Partial<KlaraSalesOrder> = {}): KlaraSalesOrder {
  return {
    id: 'so-1',
    order_number: 'SO-2024-001',
    status: 'confirmed',
    contact_id: 'cust-1',
    currency: 'CHF',
    total_amount: 8000,
    order_date: '2024-09-01T00:00:00.000Z',
    created_at: '2024-09-01T00:00:00.000Z',
    updated_at: '2024-09-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps core fields', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('so-1')
    expect(result.contactId).toBe('cust-1')
    expect(result.currency).toBe('CHF')
    expect(result.totalAmount).toBe(8000)
  })

  it('maps status draft to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status confirmed to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'confirmed' })).status).toBe('ACTIVE')
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('parses order_date as postedAt', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(
      new Date('2024-09-01T00:00:00.000Z'),
    )
  })

  it('maps positions to lineItems', () => {
    const result = transformSalesOrder(
      makeSalesOrder({
        positions: [
          {
            id: 'pos-1',
            description: 'Widget',
            quantity: 2,
            unit_price: 4000,
            total_price: 8000,
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Widget')
    expect(result.lineItems![0].unitQuantity).toBe(2)
  })

  it('passes schema validation', () => {
    expect(() => SalesOrderSchema.parse(transformSalesOrder(makeSalesOrder()))).not.toThrow()
  })
})
