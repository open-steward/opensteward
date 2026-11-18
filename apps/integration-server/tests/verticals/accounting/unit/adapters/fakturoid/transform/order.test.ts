import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type FakturoidOrder } from '../../../../../../../src/verticals/accounting/adapters/fakturoid/transform/order'

function makeOrder(overrides: Partial<FakturoidOrder> = {}): FakturoidOrder {
  return {
    id: 1001,
    number: 'ORD-2024-001',
    subject_id: 42,
    status: 'open',
    issued_on: '2024-01-15',
    total: 12100,
    currency: 'CZK',
    vat_price: 2100,
    lines: [],
    ...overrides,
  }
}

describe('transformOrder (fakturoid)', () => {
  it('maps id and core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(result.type).toBe('SALES')
    expect(result.contactId).toBe('42')
    expect(result.currency).toBe('CZK')
    expect(result.totalAmount).toBe(12100)
  })

  it('maps issued_on to postedAt as Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status "completed" to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status "invoiced" to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status "cancelled" to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status "draft" to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps line items correctly', () => {
    const raw = makeOrder({
      lines: [
        {
          id: 10,
          name: 'Widget',
          quantity: 5,
          unit_price: 1000,
          vat_rate: 21,
          unit_price_without_vat: 1000,
          unit_price_with_vat: 1210,
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('10')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(1000)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(6050)
  })

  it('sets metadata to the raw object by reference', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
