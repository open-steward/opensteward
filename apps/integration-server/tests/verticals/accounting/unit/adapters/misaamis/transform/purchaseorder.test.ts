import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type MisaAmisPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/misaamis/transform/purchaseorder'

function makeRaw(overrides: Partial<MisaAmisPurchaseOrder> = {}): MisaAmisPurchaseOrder {
  return {
    id: 'po-001',
    order_number: 'PO-2024-001',
    order_date: '2024-03-08',
    delivery_date: '2024-03-22',
    total_amount: 2000000,
    vat_amount: 200000,
    total_payment: 2200000,
    partner_id: 'vendor-001',
    partner_name: 'Nhà cung cấp Z',
    status: 1,
    order_details: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (misaamis)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('po-001')
    expect(result.contactId).toBe('vendor-001')
    expect(result.totalAmount).toBe(2200000)
  })

  it('parses order_date as Date object', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-08'))
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to ACTIVE', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 1 })).status).toBe('ACTIVE')
  })

  it('maps status 2 to COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 2 })).status).toBe('COMPLETED')
  })

  it('maps status 3 to CANCELLED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 3 })).status).toBe('CANCELLED')
  })

  it('maps order_details to lineItems', () => {
    const raw = makeRaw({
      order_details: [
        {
          id: 'detail-001',
          description: 'Nguyên liệu B',
          unit: 'tấn',
          quantity: 2,
          unit_price: 1000000,
          amount: 2000000,
          vat_rate: 10,
          vat_amount: 200000,
          account_id: 'acc-002',
          account_code: '1521',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('detail-001')
    expect(result.lineItems![0].totalAmount).toBe(2000000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
