import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type BuiltAfricaTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/built-africa/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeTransaction(overrides: Partial<BuiltAfricaTransaction> = {}): BuiltAfricaTransaction {
  return {
    id: 800,
    transaction_type: 'receipt',
    reference: 'TXN-800',
    description: 'Payment received for INV-100',
    amount: 200.0,
    base_currency: 'USD',
    payment_account: { id: 10, account_name: 'Cash' },
    receiving_account: { id: 20, account_name: 'Revenue' },
    invoice_id: 100,
    customer_id: 5,
    created_at: '2024-02-01T09:30:00Z',
    updated_at: '2024-02-02T10:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id to string', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('800')
  })

  it('maps payment_account.id to accountId as string', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('10')
  })

  it('returns undefined accountId when payment_account is absent', () => {
    expect(
      transformTransaction(makeTransaction({ payment_account: undefined })).accountId,
    ).toBeUndefined()
  })

  it('maps receiving_account.id to splitAccountId as string', () => {
    expect(transformTransaction(makeTransaction()).splitAccountId).toBe('20')
  })

  it('returns undefined splitAccountId when receiving_account is absent', () => {
    expect(
      transformTransaction(makeTransaction({ receiving_account: undefined })).splitAccountId,
    ).toBeUndefined()
  })

  it('maps transaction_type to type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('receipt')
  })

  it('maps reference', () => {
    expect(transformTransaction(makeTransaction()).reference).toBe('TXN-800')
  })

  it('maps description to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Payment received for INV-100')
  })

  it('maps base_currency to currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('USD')
  })

  it('falls back to fx_currency when base_currency is absent', () => {
    expect(
      transformTransaction(makeTransaction({ base_currency: undefined, fx_currency: 'GHS' }))
        .currency,
    ).toBe('GHS')
  })

  it('maps amount to totalAmount in minor units', () => {
    expect(transformTransaction(makeTransaction({ amount: 200.0 })).totalAmount).toBe(20000)
  })

  it('maps fractional amount correctly', () => {
    expect(transformTransaction(makeTransaction({ amount: 12.5 })).totalAmount).toBe(1250)
  })

  it('maps created_at to createdAt as Date', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(
      new Date('2024-02-01T09:30:00Z'),
    )
  })

  it('maps updated_at to updatedAt as Date', () => {
    expect(transformTransaction(makeTransaction()).updatedAt).toEqual(
      new Date('2024-02-02T10:00:00Z'),
    )
  })

  it('returns undefined type when transaction_type is absent', () => {
    expect(
      transformTransaction(makeTransaction({ transaction_type: undefined })).type,
    ).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeTransaction()))).not.toThrow()
  })
})
