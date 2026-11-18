import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type DualentryPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/dualentry/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makeRaw(overrides: Partial<DualentryPurchaseOrder> = {}): DualentryPurchaseOrder {
  return {
    id: 400,
    internal_id: 400,
    number: 6001,
    date: '2024-07-01',
    company_id: 1,
    vendor_id: 20,
    vendor_name: 'Baltic Supplies OÜ',
    currency_iso_4217_code: 'EUR',
    amount: '300.00',
    billed_total: null,
    due_total: null,
    memo: 'Raw materials',
    record_status: 'posted',
    billed_status: null,
    reference_number: 'PO-001',
    items: [],
    ...overrides,
  }
}

describe('dualentry transformPurchaseOrder', () => {
  it('maps id to string', () => {
    const result = transformPurchaseOrder(makeRaw({ id: 88 }))
    expect(result.id).toBe('88')
  })

  it('maps vendor_id with vend_ prefix to contactId', () => {
    const result = transformPurchaseOrder(makeRaw({ vendor_id: 20 }))
    expect(result.contactId).toBe('vend_20')
  })

  it('archived → CANCELLED', () => {
    const result = transformPurchaseOrder(makeRaw({ record_status: 'archived' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('billed_status=billed → COMPLETED', () => {
    const result = transformPurchaseOrder(makeRaw({ billed_status: 'billed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('posted → ACTIVE', () => {
    const result = transformPurchaseOrder(makeRaw({ record_status: 'posted', billed_status: null }))
    expect(result.status).toBe('ACTIVE')
  })

  it('draft → DRAFT', () => {
    const result = transformPurchaseOrder(makeRaw({ record_status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('amount string → minor units', () => {
    const result = transformPurchaseOrder(makeRaw({ amount: '15.00' }))
    expect(result.totalAmount).toBe(1500)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes PurchaseOrderSchema.parse without throwing', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
