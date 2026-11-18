import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type QoyodSimpleBill,
} from '../../../../../../../src/verticals/accounting/adapters/qoyod/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeRaw(overrides: Partial<QoyodSimpleBill> = {}): QoyodSimpleBill {
  return {
    id: 600,
    reference: 'SB-2025-001',
    vendor_id: 55,
    date: '2025-06-01',
    notes: 'Office supplies purchase',
    currency: 'SAR',
    total: 800,
    tax_total: 120,
    lines: [
      {
        id: 1,
        description: 'Stationery',
        amount: 680,
        tax_amount: 120,
        account_id: 40,
      },
    ],
    ...overrides,
  }
}

describe('qoyod transformExpense', () => {
  it('maps numeric id to string', () => {
    expect(transformExpense(makeRaw()).id).toBe('600')
  })

  it('maps reference to name', () => {
    expect(transformExpense(makeRaw()).name).toBe('SB-2025-001')
  })

  it('maps vendor_id to contactId as string', () => {
    expect(transformExpense(makeRaw()).contactId).toBe('55')
  })

  it('maps currency', () => {
    expect(transformExpense(makeRaw()).currency).toBe('SAR')
  })

  it('maps total directly (no ×100 conversion)', () => {
    expect(transformExpense(makeRaw()).totalAmount).toBe(800)
  })

  it('maps tax_total to taxAmount', () => {
    expect(transformExpense(makeRaw()).taxAmount).toBe(120)
  })

  it('maps date to postedAt Date', () => {
    expect(transformExpense(makeRaw()).postedAt).toBeInstanceOf(Date)
  })

  it('maps line id to string', () => {
    expect(transformExpense(makeRaw()).lineItems?.[0]?.id).toBe('1')
  })

  it('maps line description to itemDescription', () => {
    expect(transformExpense(makeRaw()).lineItems?.[0]?.itemDescription).toBe('Stationery')
  })

  it('maps line amount to totalAmount directly', () => {
    expect(transformExpense(makeRaw()).lineItems?.[0]?.totalAmount).toBe(680)
  })

  it('maps line account_id to accountId as string', () => {
    expect(transformExpense(makeRaw()).lineItems?.[0]?.accountId).toBe('40')
  })

  it('passes ExpenseSchema.parse', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeRaw()))).not.toThrow()
  })
})
