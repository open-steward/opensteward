import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type MtBill,
} from '../../../../../../../src/verticals/accounting/adapters/mineraltree/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<MtBill> = {}): MtBill {
  return {
    id: 'mt_bill_001',
    invoiceNumber: 'INV-500',
    vendor: { id: 'vnd_10', name: 'Parts Co' },
    amount: { amount: 1250.0, currency: 'USD' },
    balance: { amount: 0, currency: 'USD' },
    totalTaxAmount: { amount: 125.0, currency: 'USD' },
    transactionDate: '2024-03-01',
    dueDate: '2024-04-01',
    state: 'Settled',
    memo: 'Parts order Q1',
    ...overrides,
  }
}

describe('transformBill (mineraltree)', () => {
  it('maps id', () => {
    expect(transformBill(makeBill()).id).toBe('mt_bill_001')
  })

  it('maps invoiceNumber to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('INV-500')
  })

  it('maps vendor.id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('vnd_10')
  })

  it('maps currency from amount.currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('converts decimal amount to integer minor units via toMinorUnits', () => {
    // 1250.00 * 100 = 125000
    expect(transformBill(makeBill()).totalAmount).toBe(125000)
  })

  it('converts decimal taxAmount to integer minor units', () => {
    // 125.00 * 100 = 12500
    expect(transformBill(makeBill()).taxAmount).toBe(12500)
  })

  it('converts balance to integer minor units', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(0)
  })

  it('maps transactionDate to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps state Settled to PAID', () => {
    expect(transformBill(makeBill({ state: 'Settled' })).status).toBe('PAID')
  })

  it('maps state PendingSettled to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ state: 'PendingSettled' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps state ClosedByCredit to PAID', () => {
    expect(transformBill(makeBill({ state: 'ClosedByCredit' })).status).toBe('PAID')
  })

  it('maps state Voided to VOIDED', () => {
    expect(transformBill(makeBill({ state: 'Voided' })).status).toBe('VOIDED')
  })

  it('maps state Open to AUTHORIZED', () => {
    expect(transformBill(makeBill({ state: 'Open' })).status).toBe('AUTHORIZED')
  })

  it('maps memo to notes', () => {
    expect(transformBill(makeBill()).notes).toBe('Parts order Q1')
  })

  it('merges expenses and items into lineItems', () => {
    const raw = makeBill({
      expenses: [
        { id: 'exp_1', description: 'Freight', amount: { amount: 50.0, currency: 'USD' } },
      ],
      items: [{ id: 'item_1', description: 'Part A', amount: { amount: 100.0, currency: 'USD' } }],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].id).toBe('exp_1')
    expect(result.lineItems![0].totalAmount).toBe(5000) // 50 * 100
    expect(result.lineItems![1].id).toBe('item_1')
    expect(result.lineItems![1].totalAmount).toBe(10000) // 100 * 100
  })

  it('maps line item unitCost via toMinorUnits', () => {
    const raw = makeBill({
      expenses: [{ id: 'e1', unitCost: { amount: 25.5, currency: 'USD' }, quantity: 2 }],
    })
    const result = transformBill(raw)
    expect(result.lineItems![0].unitAmount).toBe(2550) // 25.5 * 100
    expect(result.lineItems![0].unitQuantity).toBe(2)
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('passes BillSchema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeBill()))).not.toThrow()
  })
})
