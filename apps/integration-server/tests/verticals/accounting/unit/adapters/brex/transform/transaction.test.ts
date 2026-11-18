import { describe, it, expect } from 'vitest'
import {
  transformCashTransaction,
  transformCardTransaction,
  type BrexCashTransaction,
  type BrexCardTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/brex/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeCashTransaction(overrides: Partial<BrexCashTransaction> = {}): BrexCashTransaction {
  return {
    id: 'cash_txn_001',
    description: 'Wire transfer received',
    amount: { amount: 200000, currency: 'USD' },
    initiated_at_date: '2024-02-10',
    posted_at_date: '2024-02-12',
    type: 'PAYMENT',
    merchant: { raw_descriptor: 'ACME TRANSFER' },
    ...overrides,
  }
}

function makeCardTransaction(overrides: Partial<BrexCardTransaction> = {}): BrexCardTransaction {
  return {
    id: 'card_txn_001',
    description: 'Subscription charge',
    amount: { amount: 9900, currency: 'USD' },
    initiated_at_date: '2024-02-08',
    posted_at_date: '2024-02-09',
    type: 'CARD_PURCHASE',
    merchant: { raw_descriptor: 'GITHUB.COM' },
    card_id: 'card_abc123',
    ...overrides,
  }
}

describe('transformCashTransaction', () => {
  it('maps id', () => {
    expect(transformCashTransaction(makeCashTransaction()).id).toBe('cash_txn_001')
  })

  it('maps type', () => {
    expect(transformCashTransaction(makeCashTransaction()).type).toBe('PAYMENT')
  })

  it('maps description to memo', () => {
    expect(transformCashTransaction(makeCashTransaction()).memo).toBe('Wire transfer received')
  })

  it('falls back to merchant.raw_descriptor when description is absent', () => {
    const result = transformCashTransaction(makeCashTransaction({ description: undefined }))
    expect(result.memo).toBe('ACME TRANSFER')
  })

  it('memo is undefined when both description and merchant.raw_descriptor are absent', () => {
    const result = transformCashTransaction(
      makeCashTransaction({
        description: undefined,
        merchant: undefined,
      }),
    )
    expect(result.memo).toBeUndefined()
  })

  it('maps amount.currency to currency', () => {
    expect(transformCashTransaction(makeCashTransaction()).currency).toBe('USD')
  })

  it('maps amount.amount to totalAmount without conversion', () => {
    expect(transformCashTransaction(makeCashTransaction()).totalAmount).toBe(200000)
  })

  it('does NOT set paymentMethod', () => {
    expect(transformCashTransaction(makeCashTransaction()).paymentMethod).toBeUndefined()
  })

  it('maps initiated_at_date to createdAt as Date', () => {
    expect(transformCashTransaction(makeCashTransaction()).createdAt).toEqual(
      new Date('2024-02-10'),
    )
  })

  it('maps posted_at_date to updatedAt as Date', () => {
    expect(transformCashTransaction(makeCashTransaction()).updatedAt).toEqual(
      new Date('2024-02-12'),
    )
  })

  it('updatedAt falls back to initiated_at_date when posted_at_date is absent', () => {
    const result = transformCashTransaction(makeCashTransaction({ posted_at_date: undefined }))
    expect(result.updatedAt).toEqual(new Date('2024-02-10'))
  })

  it('updatedAt is undefined when both date fields are absent', () => {
    const result = transformCashTransaction(
      makeCashTransaction({
        posted_at_date: undefined,
        initiated_at_date: undefined,
      }),
    )
    expect(result.updatedAt).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeCashTransaction()
    expect(transformCashTransaction(raw).metadata).toBe(raw)
  })

  it('produces output that passes TransactionSchema validation', () => {
    const result = transformCashTransaction(makeCashTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformCashTransaction(
      makeCashTransaction({
        description: undefined,
        amount: undefined,
        type: undefined,
        merchant: undefined,
        initiated_at_date: undefined,
        posted_at_date: undefined,
      }),
    )
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})

describe('transformCardTransaction', () => {
  it('maps id', () => {
    expect(transformCardTransaction(makeCardTransaction()).id).toBe('card_txn_001')
  })

  it('maps type', () => {
    expect(transformCardTransaction(makeCardTransaction()).type).toBe('CARD_PURCHASE')
  })

  it('maps description to memo', () => {
    expect(transformCardTransaction(makeCardTransaction()).memo).toBe('Subscription charge')
  })

  it('falls back to merchant.raw_descriptor when description is absent', () => {
    const result = transformCardTransaction(makeCardTransaction({ description: undefined }))
    expect(result.memo).toBe('GITHUB.COM')
  })

  it('maps amount.currency to currency', () => {
    expect(transformCardTransaction(makeCardTransaction()).currency).toBe('USD')
  })

  it('maps amount.amount to totalAmount without conversion', () => {
    expect(transformCardTransaction(makeCardTransaction()).totalAmount).toBe(9900)
  })

  it('sets paymentMethod to CARD', () => {
    expect(transformCardTransaction(makeCardTransaction()).paymentMethod).toBe('CARD')
  })

  it('maps initiated_at_date to createdAt as Date', () => {
    expect(transformCardTransaction(makeCardTransaction()).createdAt).toEqual(
      new Date('2024-02-08'),
    )
  })

  it('maps posted_at_date to updatedAt as Date', () => {
    expect(transformCardTransaction(makeCardTransaction()).updatedAt).toEqual(
      new Date('2024-02-09'),
    )
  })

  it('updatedAt falls back to initiated_at_date when posted_at_date is absent', () => {
    const result = transformCardTransaction(makeCardTransaction({ posted_at_date: undefined }))
    expect(result.updatedAt).toEqual(new Date('2024-02-08'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeCardTransaction()
    expect(transformCardTransaction(raw).metadata).toBe(raw)
  })

  it('metadata contains card_id', () => {
    const raw = makeCardTransaction()
    const result = transformCardTransaction(raw)
    expect((result.metadata as Record<string, unknown>)['card_id']).toBe('card_abc123')
  })

  it('produces output that passes TransactionSchema validation', () => {
    const result = transformCardTransaction(makeCardTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformCardTransaction(
      makeCardTransaction({
        description: undefined,
        amount: undefined,
        type: undefined,
        merchant: undefined,
        initiated_at_date: undefined,
        posted_at_date: undefined,
      }),
    )
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
