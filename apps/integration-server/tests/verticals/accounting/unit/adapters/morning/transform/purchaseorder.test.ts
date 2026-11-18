import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/purchaseorder'
import type { MorningDocument } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/invoice'

function makeDocument(overrides: Partial<MorningDocument> = {}): MorningDocument {
  return {
    id: 'po_1',
    type: 400,
    status: 0,
    number: 'PO-001',
    sum: 2500,
    vat: 425,
    currency: 'ILS',
    date: '2024-03-08',
    client: { id: 'supplier_4' },
    ...overrides,
  }
}

describe('transformPurchaseOrder (morning)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeDocument())
    expect(result.id).toBe('po_1')
    expect(result.contactId).toBe('supplier_4')
    expect(result.totalAmount).toBe(2500)
    expect(result.currency).toBe('ILS')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makeDocument())
    expect(result.postedAt).toEqual(new Date('2024-03-08'))
  })

  it('maps status 0 to DRAFT', () => {
    const result = transformPurchaseOrder(makeDocument({ status: 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status 1 to ACTIVE', () => {
    const result = transformPurchaseOrder(makeDocument({ status: 1 }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status 2 to COMPLETED', () => {
    const result = transformPurchaseOrder(makeDocument({ status: 2 }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status -1 to CANCELLED', () => {
    const result = transformPurchaseOrder(makeDocument({ status: -1 }))
    expect(result.status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeDocument()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeDocument())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
