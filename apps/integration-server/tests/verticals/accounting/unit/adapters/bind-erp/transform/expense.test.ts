import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type BindExpenseDetails,
} from '../../../../../../../src/verticals/accounting/adapters/bind-erp/transform/expense'

function makeExpense(overrides: Partial<BindExpenseDetails> = {}): BindExpenseDetails {
  return {
    ID: 'exp-1',
    UUID: 'uuid-exp-1',
    ProviderID: 'prov-1',
    ClientID: 'client-1',
    LocationID: 'loc-1',
    DocumentNumber: 'EXP-001',
    DocumentTypeText: 'Purchase Order',
    StatusCode: 1,
    CreationDate: '2024-04-10T00:00:00',
    VAT: 160,
    IEPS: 40,
    VATRetention: 20,
    ISRRetention: 10,
    Discount: 30,
    CurrencyName: 'MXN',
    CurrencyID: 'MX',
    ExpensePurchaseOrderItems: [
      { ID: 'i1', IndexItem: 0, TypeID: 'prod-A', Name: 'Product A', Cost: 400, Qty: 2 },
      { ID: 'i2', IndexItem: 1, TypeID: 'prod-B', Name: 'Product B', Cost: 200, Qty: 3 },
    ],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('prefers ID over UUID for id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-1')
  })

  it('falls back to UUID when ID is absent', () => {
    expect(transformExpense(makeExpense({ ID: undefined })).id).toBe('uuid-exp-1')
  })

  it('returns empty string when both ID and UUID are absent', () => {
    expect(transformExpense(makeExpense({ ID: undefined, UUID: undefined })).id).toBe('')
  })

  it('prefers DocumentNumber over DocumentTypeText for name', () => {
    expect(transformExpense(makeExpense()).name).toBe('EXP-001')
  })

  it('falls back to DocumentTypeText when DocumentNumber is absent', () => {
    expect(transformExpense(makeExpense({ DocumentNumber: undefined })).name).toBe('Purchase Order')
  })

  it('maps LocationID to accountId', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('loc-1')
  })

  it('prefers ProviderID over ClientID for contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('prov-1')
  })

  it('falls back to ClientID when ProviderID is absent', () => {
    expect(transformExpense(makeExpense({ ProviderID: undefined })).contactId).toBe('client-1')
  })

  it('prefers CurrencyName over CurrencyID', () => {
    expect(transformExpense(makeExpense()).currency).toBe('MXN')
  })

  it('falls back to CurrencyID when CurrencyName is absent', () => {
    expect(transformExpense(makeExpense({ CurrencyName: undefined })).currency).toBe('MX')
  })

  it('computes taxAmount as VAT + IEPS - VATRetention - ISRRetention', () => {
    // 160 + 40 - 20 - 10 = 170
    expect(transformExpense(makeExpense()).taxAmount).toBe(170)
  })

  it('computes totalAmount from items subtotal minus discount plus taxAmount', () => {
    // subtotal = 400*2 + 200*3 = 800 + 600 = 1400; tax = 170; total = 1400 - 30 + 170 = 1540
    expect(transformExpense(makeExpense()).totalAmount).toBe(1540)
  })

  it('maps line items with IndexItem as id', () => {
    const e = transformExpense(makeExpense())
    expect(e.lineItems).toHaveLength(2)
    expect(e.lineItems![0].id).toBe('0')
    expect(e.lineItems![0].itemId).toBe('prod-A')
    expect(e.lineItems![0].itemName).toBe('Product A')
    expect(e.lineItems![0].unitAmount).toBe(400)
    expect(e.lineItems![0].unitQuantity).toBe(2)
  })

  it('falls back to item ID when IndexItem is absent', () => {
    const e = transformExpense(
      makeExpense({
        ExpensePurchaseOrderItems: [{ ID: 'fallback-id', Cost: 100, Qty: 1 }],
      }),
    )
    expect(e.lineItems![0].id).toBe('fallback-id')
  })

  it('rounds fractional Qty to integer', () => {
    const e = transformExpense(
      makeExpense({
        ExpensePurchaseOrderItems: [{ IndexItem: 0, Cost: 50, Qty: 3.6 }],
      }),
    )
    expect(e.lineItems![0].unitQuantity).toBe(4)
  })

  it('defaults Qty to 1 in subtotal calculation when absent', () => {
    // item with no Qty: Cost=100, Qty defaults to 1 in reduce → subtotal=100
    const e = transformExpense(
      makeExpense({
        ExpensePurchaseOrderItems: [{ IndexItem: 0, Cost: 100 }],
        VAT: 0,
        IEPS: 0,
        VATRetention: 0,
        ISRRetention: 0,
        Discount: 0,
      }),
    )
    expect(e.totalAmount).toBe(100)
  })

  it('returns undefined lineItems when items array is empty', () => {
    expect(
      transformExpense(makeExpense({ ExpensePurchaseOrderItems: [] })).lineItems,
    ).toBeUndefined()
  })

  it('maps CreationDate to both postedAt and createdAt', () => {
    const e = transformExpense(makeExpense())
    expect(e.postedAt).toEqual(new Date('2024-04-10T00:00:00'))
    expect(e.createdAt).toEqual(new Date('2024-04-10T00:00:00'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
