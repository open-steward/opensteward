import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type MisaAmisSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/misaamis/transform/salesorder'

function makeRaw(overrides: Partial<MisaAmisSalesOrder> = {}): MisaAmisSalesOrder {
  return {
    id: 'so-001',
    order_number: 'SO-2024-001',
    order_date: '2024-03-10',
    delivery_date: '2024-03-25',
    total_amount: 4000000,
    vat_amount: 400000,
    total_payment: 4400000,
    partner_id: 'partner-001',
    partner_name: 'Khách hàng B',
    status: 1,
    order_details: [],
    ...overrides,
  }
}

describe('transformSalesOrder (misaamis)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('so-001')
    expect(result.contactId).toBe('partner-001')
    expect(result.totalAmount).toBe(4400000)
  })

  it('parses order_date as Date object', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformSalesOrder(makeRaw({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to ACTIVE', () => {
    expect(transformSalesOrder(makeRaw({ status: 1 })).status).toBe('ACTIVE')
  })

  it('maps status 2 to COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ status: 2 })).status).toBe('COMPLETED')
  })

  it('maps status 3 to CANCELLED', () => {
    expect(transformSalesOrder(makeRaw({ status: 3 })).status).toBe('CANCELLED')
  })

  it('maps order_details to lineItems', () => {
    const raw = makeRaw({
      order_details: [
        {
          id: 'detail-001',
          description: 'Dịch vụ A',
          unit: 'lần',
          quantity: 5,
          unit_price: 800000,
          amount: 4000000,
          vat_rate: 10,
          vat_amount: 400000,
          account_id: 'acc-001',
          account_code: '5111',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].unitQuantity).toBe(5)
    expect(result.lineItems![0].unitAmount).toBe(800000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
