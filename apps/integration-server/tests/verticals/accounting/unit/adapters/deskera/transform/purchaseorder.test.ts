import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type DeskeraPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/deskera/transform/purchaseorder'

function makeRaw(overrides: Partial<DeskeraPurchaseOrder> = {}): DeskeraPurchaseOrder {
  return {
    id: 'PO-001',
    documentSequenceCode: 'PO-2024-001',
    documentDate: '2024-01-10',
    validTillDate: '2024-02-10',
    totalAmount: 8000,
    taxAmount: 720,
    currency: 'SGD',
    contactCode: 'VEND-001',
    contactName: 'Supplier Co',
    status: 'OPEN',
    documentItems: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (Deskera)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('PO-001')
    expect(result.contactId).toBe('VEND-001')
    expect(result.totalAmount).toBe(8000)
    expect(result.currency).toBe('SGD')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-10'))
  })

  it('maps CLOSED status to COMPLETED', () => {
    const result = transformPurchaseOrder(makeRaw({ status: 'CLOSED' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps CANCELLED status correctly', () => {
    const result = transformPurchaseOrder(makeRaw({ status: 'CANCELLED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps unknown status to ACTIVE', () => {
    const result = transformPurchaseOrder(makeRaw({ status: 'DRAFT' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps document items to lineItems', () => {
    const raw = makeRaw({
      documentItems: [
        {
          id: 'li-1',
          name: 'Office supplies',
          description: 'Paper reams',
          quantity: 10,
          unitPrice: 800,
          totalAmount: 8000,
          taxAmount: 720,
          accountCode: 'SUP-001',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(8000)
    expect(result.lineItems![0].accountId).toBe('SUP-001')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
