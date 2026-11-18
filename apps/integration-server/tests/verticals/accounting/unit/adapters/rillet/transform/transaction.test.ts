import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RilletBankTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/rillet/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeTransaction(overrides: Partial<RilletBankTransaction> = {}): RilletBankTransaction {
  return {
    id: 'txn_8001',
    bank_account_id: 'acct_checking',
    subsidiary_id: 'sub_1',
    date: '2026-02-15',
    name: 'Payment from Acme Industries',
    merchant: 'Acme Industries',
    net_amount: { amount: '250.00', currency: 'USD' },
    fee: { amount: '2.50', currency: 'USD' },
    pending: false,
    excluded: false,
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id directly', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn_8001')
  })

  it('maps bank_account_id to accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('acct_checking')
  })

  it('maps name to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Payment from Acme Industries')
  })

  it('maps currency from net_amount.currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('USD')
  })

  it('converts net_amount.amount string to minor units (totalAmount)', () => {
    // "250.00" → 25000
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(25000)
  })

  it('maps date string to createdAt Date', () => {
    // date is a plain date string (not a timestamp), mapped to createdAt
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2026-02-15'))
  })

  it('yields undefined memo when name is empty string', () => {
    expect(transformTransaction(makeTransaction({ name: '' })).memo).toBeUndefined()
  })

  it('yields undefined accountId when bank_account_id is empty string', () => {
    expect(transformTransaction(makeTransaction({ bank_account_id: '' })).accountId).toBeUndefined()
  })

  it('handles fractional amounts with rounding', () => {
    // "0.015" → Math.round(0.015 * 100) = Math.round(1.5) = 2
    const result = transformTransaction(
      makeTransaction({ net_amount: { amount: '0.015', currency: 'EUR' } }),
    )
    expect(result.totalAmount).toBe(2)
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces output that passes TransactionSchema validation', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('does not scale a zero-decimal currency (JPY) by 100', () => {
    const txn = makeTransaction({
      net_amount: { amount: '25000', currency: 'JPY' },
      fee: { amount: '0', currency: 'JPY' },
    })
    const out = TransactionSchema.parse(transformTransaction(txn))
    expect(out.currency).toBe('JPY')
    expect(out.totalAmount).toBe(25000)
  })

  it('scales a three-decimal currency (BHD) by 1000', () => {
    const txn = makeTransaction({
      net_amount: { amount: '250.125', currency: 'BHD' },
      fee: { amount: '0.500', currency: 'BHD' },
    })
    const out = TransactionSchema.parse(transformTransaction(txn))
    expect(out.currency).toBe('BHD')
    expect(out.totalAmount).toBe(250125)
  })
})
