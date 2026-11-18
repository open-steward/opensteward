import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  untransformSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/ledgersmb/transform/salesorder'
import type { LedgerSMBOrder } from '../../../../../../../src/verticals/accounting/adapters/ledgersmb/transform/order'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makeSOOrder(overrides: Partial<LedgerSMBOrder> = {}): LedgerSMBOrder {
  return {
    id: 'so-20',
    type: 'customer',
    currency: 'EUR',
    eca: { id: 22, type: 'customer' },
    total: 750.0,
    dates: { order: '2024-11-01' },
    workflow: { state: 'ONHOLD' },
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps core fields with minor-unit conversion', () => {
    const result = transformSalesOrder(makeSOOrder())
    expect(result.id).toBe('so-20')
    expect(result.contactId).toBe('22')
    expect(result.currency).toBe('EUR')
    // 750.0 → 75000
    expect(result.totalAmount).toBe(75000)
  })

  it('maps workflow ONHOLD to ACTIVE', () => {
    expect(transformSalesOrder(makeSOOrder({ workflow: { state: 'ONHOLD' } })).status).toBe(
      'ACTIVE',
    )
  })

  it('maps workflow POSTED to COMPLETED', () => {
    expect(transformSalesOrder(makeSOOrder({ workflow: { state: 'POSTED' } })).status).toBe(
      'COMPLETED',
    )
  })

  it('maps workflow INITIAL to DRAFT', () => {
    expect(transformSalesOrder(makeSOOrder({ workflow: { state: 'INITIAL' } })).status).toBe(
      'DRAFT',
    )
  })

  it('maps workflow DELETED to CANCELLED', () => {
    expect(transformSalesOrder(makeSOOrder({ workflow: { state: 'DELETED' } })).status).toBe(
      'CANCELLED',
    )
  })

  it('parses dates.order as postedAt', () => {
    expect(transformSalesOrder(makeSOOrder()).postedAt).toEqual(new Date('2024-11-01'))
  })

  it('maps lines to lineItems', () => {
    const result = transformSalesOrder(
      makeSOOrder({
        lines: [
          {
            id: 'sl-1',
            description: 'Custom order item',
            qty: 5,
            price: 150.0,
            total: 750.0,
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Custom order item')
    expect(result.lineItems![0].unitQuantity).toBe(5)
    expect(result.lineItems![0].unitAmount).toBe(15000)
  })

  it('passes schema validation', () => {
    expect(() => SalesOrderSchema.parse(transformSalesOrder(makeSOOrder()))).not.toThrow()
  })

  it('round-trips through untransformSalesOrder', () => {
    const canonical = transformSalesOrder(makeSOOrder())
    const wire = untransformSalesOrder(canonical)
    expect((wire.eca as { id?: string })?.id).toBe('22')
    expect(wire.currency).toBe('EUR')
  })
})
