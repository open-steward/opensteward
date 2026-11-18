import { describe, it, expect } from 'vitest'
import {
  transformBankTransaction,
  type MossBankTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/moss/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<MossBankTransaction> = {}): MossBankTransaction {
  return {
    id: 'txn-001',
    bankAccountId: 'bank-001',
    organisationId: 'org-001',
    transactionType: 'PAYMENT',
    amount: { amount: '250.00', currency: 'EUR' },
    bookingDate: '2024-03-15',
    valueDate: '2024-03-15',
    description: 'Invoice payment',
    fees: [],
    ...overrides,
  }
}

describe('transformBankTransaction (moss)', () => {
  it('maps id', () => {
    expect(transformBankTransaction(makeRaw()).id).toBe('txn-001')
  })

  it('maps bankAccountId to accountId', () => {
    expect(transformBankTransaction(makeRaw()).accountId).toBe('bank-001')
  })

  it('maps transactionType to type', () => {
    expect(transformBankTransaction(makeRaw()).type).toBe('PAYMENT')
  })

  it('maps description to memo', () => {
    expect(transformBankTransaction(makeRaw()).memo).toBe('Invoice payment')
  })

  it('maps amount currency', () => {
    expect(transformBankTransaction(makeRaw()).currency).toBe('EUR')
  })

  it('converts amount string to minor units (250.00 → 25000)', () => {
    expect(transformBankTransaction(makeRaw()).totalAmount).toBe(25000)
  })

  it('maps bookingDate to createdAt', () => {
    expect(transformBankTransaction(makeRaw()).createdAt).toEqual(new Date('2024-03-15'))
  })

  it('creates one lineitem for the main transaction', () => {
    expect(transformBankTransaction(makeRaw()).lineItems).toHaveLength(1)
  })

  it('appends fee lineItems when fees present', () => {
    const raw = makeRaw({
      fees: [{ amount: { amount: '2.50', currency: 'EUR' } }],
    })
    const t = transformBankTransaction(raw)
    expect(t.lineItems).toHaveLength(2)
    expect(t.lineItems![1].totalAmount).toBe(250)
    expect(t.lineItems![1].description).toBe('fee')
  })

  it('passes TransactionSchema.parse without throwing', () => {
    expect(() => TransactionSchema.parse(transformBankTransaction(makeRaw()))).not.toThrow()
  })
})
