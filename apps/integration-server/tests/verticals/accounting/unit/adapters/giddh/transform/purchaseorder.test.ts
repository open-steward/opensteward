import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/purchaseorder'
import type { GiddhOrderVoucher } from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/order'

function makeRaw(overrides: Partial<GiddhOrderVoucher> = {}): GiddhOrderVoucher {
  return {
    uniqueName: 'purchase-order-001',
    number: 'PO-2024-001',
    voucherDate: '2024-03-08',
    dueDate: '2024-03-22',
    grandTotal: 30000,
    taxesTotal: 5400,
    account: { uniqueName: 'vendor-mno', name: 'MNO Suppliers' },
    status: 'active',
    entries: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (giddh)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('purchase-order-001')
    expect(result.contactId).toBe('vendor-mno')
    expect(result.totalAmount).toBe(30000)
  })

  it('parses voucherDate as Date object', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-08'))
  })

  it('maps status draft to DRAFT', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status received to COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'received' })).status).toBe('COMPLETED')
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps entries to lineItems', () => {
    const raw = makeRaw({
      entries: [
        {
          uniqueName: 'entry-001',
          description: 'Raw Material C',
          quantity: 100,
          rate: 300,
          amount: 30000,
          accountUniqueName: 'purchases-account',
          accountName: 'Purchases',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(30000)
    expect(result.lineItems![0].unitQuantity).toBe(100)
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
