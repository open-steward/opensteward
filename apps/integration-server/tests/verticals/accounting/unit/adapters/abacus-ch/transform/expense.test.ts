import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type AbacusExpense,
} from '../../../../../../../src/verticals/accounting/adapters/abacus-ch/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeAbacusExpense(overrides: Partial<AbacusExpense> = {}): AbacusExpense {
  return {
    Id: '7001',
    Name: 'Office Supplies',
    Description: 'Stationery purchase',
    AccountId: '6000',
    ContactId: '200',
    UserId: '50',
    CurrencyCode: 'CHF',
    PaymentMethod: 'CARD',
    TaxAmount: 2.3,
    TotalAmount: 30.0,
    ReimbursedAmount: 30.0,
    ExpenseDate: '2024-02-15',
    ApprovedAt: '2024-02-16T10:00:00.000Z',
    ReimbursedAt: '2024-02-20T00:00:00.000Z',
    Positions: [
      {
        Id: '1',
        AccountId: '6000',
        Description: 'Paper',
        Quantity: 1,
        UnitPrice: 30.0,
        TotalPrice: 30.0,
        TaxAmount: 2.3,
      },
    ],
    CreatedAt: '2024-02-15T00:00:00.000Z',
    ModifiedAt: '2024-02-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformExpense (abacus-ch)', () => {
  it('maps Id as string', () => {
    expect(transformExpense(makeAbacusExpense({ Id: 7001 })).id).toBe('7001')
  })

  it('prefers Name for name field', () => {
    expect(transformExpense(makeAbacusExpense({ Name: 'Travel' })).name).toBe('Travel')
  })

  it('falls back to Description when Name is absent', () => {
    const result = transformExpense(makeAbacusExpense({ Name: undefined }))
    expect(result.name).toBe('Stationery purchase')
  })

  it('maps AccountId and ContactId and UserId', () => {
    const result = transformExpense(makeAbacusExpense())
    expect(result.accountId).toBe('6000')
    expect(result.contactId).toBe('200')
    expect(result.userId).toBe('50')
  })

  it('maps CurrencyCode and PaymentMethod', () => {
    const result = transformExpense(makeAbacusExpense())
    expect(result.currency).toBe('CHF')
    expect(result.paymentMethod).toBe('CARD')
  })

  it('converts TotalAmount and TaxAmount to minor units', () => {
    const result = transformExpense(makeAbacusExpense({ TotalAmount: 30.0, TaxAmount: 2.3 }))
    expect(result.totalAmount).toBe(3000)
    expect(result.taxAmount).toBe(230)
  })

  it('converts ReimbursedAmount to minor units', () => {
    expect(transformExpense(makeAbacusExpense({ ReimbursedAmount: 30.0 })).reimbursedAmount).toBe(
      3000,
    )
  })

  it('maps ExpenseDate to postedAt', () => {
    expect(transformExpense(makeAbacusExpense()).postedAt).toBeInstanceOf(Date)
  })

  it('maps ApprovedAt and ReimbursedAt as Date', () => {
    const result = transformExpense(makeAbacusExpense())
    expect(result.approvedAt).toBeInstanceOf(Date)
    expect(result.reimbursedAt).toBeInstanceOf(Date)
  })

  it('maps line items with minor-unit conversion', () => {
    const result = transformExpense(makeAbacusExpense())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.accountId).toBe('6000')
    expect(li.itemDescription).toBe('Paper')
    expect(li.unitAmount).toBe(3000) // 30.0 * 100
    expect(li.totalAmount).toBe(3000)
    expect(li.taxAmount).toBe(230) // 2.3 * 100
  })

  it('passes ExpenseSchema.parse without throwing', () => {
    const result = transformExpense(makeAbacusExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
