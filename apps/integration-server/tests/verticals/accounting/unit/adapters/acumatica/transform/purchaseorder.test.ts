import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type AcumaticaPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/acumatica/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<AcumaticaPurchaseOrder> = {}): AcumaticaPurchaseOrder {
  return {
    OrderNbr: 'PO001',
    OrderType: 'PO',
    Status: 'Open',
    CuryOrderTotal: 700,
    CurrencyID: 'USD',
    VendorID: 'VEND002',
    OrderDate: '2024-03-08',
    Details: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (Acumatica)', () => {
  it('maps id from OrderNbr', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('PO001')
  })

  it('maps contacts from VendorID', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('VEND002')
  })

  it('maps totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(700)
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('USD')
  })

  it('parses OrderDate as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-03-08'))
  })

  it('passes raw object as metadata', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('maps Open status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Open' })).status).toBe('ACTIVE')
  })

  it('maps Completed status to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Completed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Hold' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
