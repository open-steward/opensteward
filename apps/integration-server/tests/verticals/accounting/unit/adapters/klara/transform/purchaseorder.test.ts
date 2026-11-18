import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type KlaraPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/klara/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makePO(overrides: Partial<KlaraPurchaseOrder> = {}): KlaraPurchaseOrder {
  return {
    id: 'po-1',
    purchase_order_number: 'PO-2024-001',
    status: 'open',
    contact_id: 'supplier-1',
    currency: 'CHF',
    total_amount: 20000,
    order_date: '2024-08-01T00:00:00.000Z',
    created_at: '2024-08-01T00:00:00.000Z',
    updated_at: '2024-08-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps core fields', () => {
    const result = transformPurchaseOrder(makePO())
    expect(result.id).toBe('po-1')
    expect(result.contactId).toBe('supplier-1')
    expect(result.currency).toBe('CHF')
    expect(result.totalAmount).toBe(20000)
  })

  it('maps status draft to DRAFT', () => {
    expect(transformPurchaseOrder(makePO({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status open to ACTIVE', () => {
    expect(transformPurchaseOrder(makePO({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps status received to COMPLETED', () => {
    expect(transformPurchaseOrder(makePO({ status: 'received' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePO({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('parses order_date as postedAt', () => {
    expect(transformPurchaseOrder(makePO()).postedAt).toEqual(new Date('2024-08-01T00:00:00.000Z'))
  })

  it('maps positions to lineItems', () => {
    const result = transformPurchaseOrder(
      makePO({
        positions: [
          {
            id: 'pos-1',
            description: 'Raw material',
            quantity: 10,
            unit_price: 2000,
            total_price: 20000,
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Raw material')
    expect(result.lineItems![0].unitQuantity).toBe(10)
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(makePO()))).not.toThrow()
  })
})
