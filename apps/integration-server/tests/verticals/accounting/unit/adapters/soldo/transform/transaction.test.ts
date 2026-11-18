import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type SoldoTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/soldo/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<SoldoTransaction> = {}): SoldoTransaction {
  return {
    id: 'txn_001',
    wallet_id: 'wlt_abc',
    wallet_name: 'Main Wallet',
    status: 'CONFIRMED',
    category: 'TRAVEL',
    transaction_sign: 'Negative',
    amount: 45.99,
    amount_currency: 'EUR',
    tx_amount: 45.99,
    tx_amount_currency: 'EUR',
    date: '2024-05-15T12:30:00.000Z',
    update_time: '2024-05-15T14:00:00.000Z',
    merchant: {
      id: 'mch_001',
      name: 'Acme Flights',
      raw_name: 'ACME FLIGHTS LTD',
    },
    ...overrides,
  }
}

describe('transformTransaction (soldo)', () => {
  it('maps id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('txn_001')
  })

  it('maps wallet_id to accountId', () => {
    expect(transformTransaction(makeRaw()).accountId).toBe('wlt_abc')
  })

  it('maps Negative transaction_sign to DEBIT type', () => {
    expect(transformTransaction(makeRaw({ transaction_sign: 'Negative' })).type).toBe('DEBIT')
  })

  it('maps Positive transaction_sign to CREDIT type', () => {
    expect(transformTransaction(makeRaw({ transaction_sign: 'Positive' })).type).toBe('CREDIT')
  })

  it('maps merchant.name to memo', () => {
    expect(transformTransaction(makeRaw()).memo).toBe('Acme Flights')
  })

  it('falls back to merchant.raw_name when merchant.name absent', () => {
    const result = transformTransaction(makeRaw({ merchant: { raw_name: 'ACME FLIGHTS LTD' } }))
    expect(result.memo).toBe('ACME FLIGHTS LTD')
  })

  it('maps amount_currency to currency', () => {
    expect(transformTransaction(makeRaw()).currency).toBe('EUR')
  })

  it('converts amount to minor units (45.99 → 4599)', () => {
    // Soldo major units → canonical minor units
    expect(transformTransaction(makeRaw({ amount: 45.99 })).totalAmount).toBe(4599)
  })

  it('maps date to createdAt Date', () => {
    expect(transformTransaction(makeRaw()).createdAt).toEqual(new Date('2024-05-15T12:30:00.000Z'))
  })

  it('maps update_time to updatedAt Date', () => {
    expect(transformTransaction(makeRaw()).updatedAt).toEqual(new Date('2024-05-15T14:00:00.000Z'))
  })

  it('passes TransactionSchema.parse without throwing', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeRaw()))).not.toThrow()
  })
})
