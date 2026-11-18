import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RampPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/ramp/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makePO(overrides: Partial<RampPurchaseOrder> = {}): RampPurchaseOrder {
  return {
    id: 'po_uuid_001',
    po_number: 'PO-2024-001',
    vendor: { id: 'vendor_abc', name: 'Parts Supplier' },
    amount: { amount: 500000, currency_code: 'USD' },
    status: 'OPEN',
    start_date: '2024-03-01',
    end_date: '2024-06-30',
    created_at: '2024-02-28T10:00:00Z',
    updated_at: '2024-03-01T08:00:00Z',
    line_items: [
      {
        id: 'li_001',
        description: 'Steel bolts',
        amount: 500000,
        gl_account_id: 'gl_1400',
        quantity: 1000,
        unit_price: 500,
      },
    ],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id', () => {
    expect(transformPurchaseOrder(makePO()).id).toBe('po_uuid_001')
  })

  it('maps vendor.id to contactId', () => {
    expect(transformPurchaseOrder(makePO()).contactId).toBe('vendor_abc')
  })

  it('maps amount.currency_code to currency', () => {
    expect(transformPurchaseOrder(makePO()).currency).toBe('USD')
  })

  it('maps amount.amount to totalAmount without conversion (already minor units)', () => {
    expect(transformPurchaseOrder(makePO()).totalAmount).toBe(500000)
  })

  it('maps OPEN status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePO({ status: 'OPEN' })).status).toBe('ACTIVE')
  })

  it('maps CLOSED status to COMPLETED', () => {
    expect(transformPurchaseOrder(makePO({ status: 'CLOSED' })).status).toBe('COMPLETED')
  })

  it('maps CANCELLED status to CANCELLED', () => {
    expect(transformPurchaseOrder(makePO({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps DRAFT status to DRAFT', () => {
    expect(transformPurchaseOrder(makePO({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps start_date to postedAt as Date', () => {
    expect(transformPurchaseOrder(makePO()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps created_at to createdAt as Date', () => {
    expect(transformPurchaseOrder(makePO()).createdAt).toEqual(new Date('2024-02-28T10:00:00Z'))
  })

  it('maps line_items to lineItems', () => {
    const result = transformPurchaseOrder(makePO())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].accountId).toBe('gl_1400')
    expect(result.lineItems?.[0].itemDescription).toBe('Steel bolts')
    expect(result.lineItems?.[0].totalAmount).toBe(500000)
    expect(result.lineItems?.[0].unitQuantity).toBe(1000)
  })

  it('passes raw object as metadata', () => {
    const raw = makePO()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces output that passes PurchaseOrderSchema validation', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(makePO()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformPurchaseOrder({ id: 'po_001' })
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
