import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformOrder,
  type CraterEstimate,
} from '../../../../../../../src/verticals/accounting/adapters/crater/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeOrder(overrides: Partial<CraterEstimate> = {}): CraterEstimate {
  return {
    id: 'est-3',
    estimate_number: 'EST-0003',
    status: 'SENT',
    customer_business_id: 'biz-7',
    estimate_date: '2026-04-01',
    expiry_date: '2026-05-01',
    total: 8000,
    currency: { code: 'USD' },
    items: [],
    created_at: '2026-04-01T08:00:00.000Z',
    updated_at: '2026-04-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrder (crater)', () => {
  it('maps id and type', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('est-3')
    expect(result.type).toBe('SALES')
  })

  it('maps contactId from customer_business_id', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('biz-7')
  })

  it('maps totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(8000)
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('USD')
  })

  it('parses estimate_date as postedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2026-04-01')).toBe(true)
  })

  it('SENT status → ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'SENT' })).status).toBe('ACTIVE')
  })

  it('VIEWED status → ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'VIEWED' })).status).toBe('ACTIVE')
  })

  it('ACCEPTED status → COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'ACCEPTED' })).status).toBe('COMPLETED')
  })

  it('REJECTED status → CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'REJECTED' })).status).toBe('CANCELLED')
  })

  it('EXPIRED status → CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'EXPIRED' })).status).toBe('CANCELLED')
  })

  it('DRAFT status → DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('undefined status → DRAFT', () => {
    expect(transformOrder(makeOrder({ status: undefined })).status).toBe('DRAFT')
  })

  it('maps line items', () => {
    const result = transformOrder(
      makeOrder({
        items: [{ id: 'li-1', name: 'Widget', price: 500, quantity: 4, total: 2000 }],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemName).toBe('Widget')
    expect(result.lineItems![0].totalAmount).toBe(2000)
  })

  it('attaches raw as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('passes OrderSchema.parse without throwing', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
