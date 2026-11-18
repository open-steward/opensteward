import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type AfasPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/afas/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makeRaw(overrides: Partial<AfasPurchaseOrder> = {}): AfasPurchaseOrder {
  return {
    OrderNr: 'PO-001',
    CreditorId: 'CR-001',
    Description: 'Hardware purchase',
    AmtTotal: 1200,
    CurrencyId: 'EUR',
    OrderDate: '2024-01-25',
    Status: 'O',
    ...overrides,
  }
}

describe('transformPurchaseOrder (afas)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('PO-001')
    expect(result.contactId).toBe('CR-001')
    expect(result.currency).toBe('EUR')
    // AmtTotal=1200 → toMinorUnits → 120000
    expect(result.totalAmount).toBe(120000)
  })

  it('parses OrderDate as Date object', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-25'))
  })

  it('maps Status=R to COMPLETED', () => {
    const result = transformPurchaseOrder(makeRaw({ Status: 'R' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Status=C to CANCELLED', () => {
    const result = transformPurchaseOrder(makeRaw({ Status: 'C' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps Status=O to ACTIVE', () => {
    const result = transformPurchaseOrder(makeRaw({ Status: 'O' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes PurchaseOrderSchema.parse without throwing', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
