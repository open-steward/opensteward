import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  untransformPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/ledgersmb/transform/purchaseorder'
import type { LedgerSMBOrder } from '../../../../../../../src/verticals/accounting/adapters/ledgersmb/transform/order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makePOOrder(overrides: Partial<LedgerSMBOrder> = {}): LedgerSMBOrder {
  return {
    id: 'po-77',
    type: 'vendor',
    currency: 'GBP',
    eca: { id: 33, type: 'vendor' },
    total: 250.0,
    dates: { order: '2024-10-01' },
    workflow: { state: 'SAVED' },
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps core fields with minor-unit conversion', () => {
    const result = transformPurchaseOrder(makePOOrder())
    expect(result.id).toBe('po-77')
    expect(result.contactId).toBe('33')
    expect(result.currency).toBe('GBP')
    // 250.0 → 25000
    expect(result.totalAmount).toBe(25000)
  })

  it('maps workflow SAVED to ACTIVE', () => {
    expect(transformPurchaseOrder(makePOOrder({ workflow: { state: 'SAVED' } })).status).toBe(
      'ACTIVE',
    )
  })

  it('maps workflow POSTED to COMPLETED', () => {
    expect(transformPurchaseOrder(makePOOrder({ workflow: { state: 'POSTED' } })).status).toBe(
      'COMPLETED',
    )
  })

  it('maps workflow INITIAL to DRAFT', () => {
    expect(transformPurchaseOrder(makePOOrder({ workflow: { state: 'INITIAL' } })).status).toBe(
      'DRAFT',
    )
  })

  it('maps workflow VOIDED to CANCELLED', () => {
    expect(transformPurchaseOrder(makePOOrder({ workflow: { state: 'VOIDED' } })).status).toBe(
      'CANCELLED',
    )
  })

  it('parses dates.order as postedAt', () => {
    expect(transformPurchaseOrder(makePOOrder()).postedAt).toEqual(new Date('2024-10-01'))
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(makePOOrder()))).not.toThrow()
  })

  it('round-trips through untransformPurchaseOrder', () => {
    const canonical = transformPurchaseOrder(makePOOrder())
    const wire = untransformPurchaseOrder(canonical)
    expect((wire.eca as { id?: string })?.id).toBe('33')
    expect(wire.currency).toBe('GBP')
  })
})
