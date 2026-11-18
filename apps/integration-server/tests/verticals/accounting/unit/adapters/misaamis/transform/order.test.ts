import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type MisaAmisOrder,
} from '../../../../../../../src/verticals/accounting/adapters/misaamis/transform/order'

function makeRaw(overrides: Partial<MisaAmisOrder> = {}): MisaAmisOrder {
  return {
    id: 'order-001',
    order_number: 'SO-2024-001',
    order_date: '2024-03-10',
    delivery_date: '2024-03-20',
    total_amount: 3000000,
    vat_amount: 300000,
    total_payment: 3300000,
    partner_id: 'partner-001',
    partner_name: 'Khách hàng A',
    status: 1,
    order_details: [],
    ...overrides,
  }
}

describe('transformOrder (misaamis)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('order-001')
    expect(result.type).toBe('SALES')
    expect(result.contactId).toBe('partner-001')
    expect(result.totalAmount).toBe(3300000)
  })

  it('parses order_date as Date object', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformOrder(makeRaw({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to ACTIVE', () => {
    expect(transformOrder(makeRaw({ status: 1 })).status).toBe('ACTIVE')
  })

  it('maps status 2 to COMPLETED', () => {
    expect(transformOrder(makeRaw({ status: 2 })).status).toBe('COMPLETED')
  })

  it('maps status 3 to CANCELLED', () => {
    expect(transformOrder(makeRaw({ status: 3 })).status).toBe('CANCELLED')
  })

  it('maps order_details to lineItems', () => {
    const raw = makeRaw({
      order_details: [
        {
          id: 'detail-001',
          description: 'Hàng hóa A',
          unit: 'cái',
          quantity: 10,
          unit_price: 300000,
          amount: 3000000,
          vat_rate: 10,
          vat_amount: 300000,
          account_id: 'acc-001',
          account_code: '5111',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(3000000)
    expect(result.lineItems![0].unitQuantity).toBe(10)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
