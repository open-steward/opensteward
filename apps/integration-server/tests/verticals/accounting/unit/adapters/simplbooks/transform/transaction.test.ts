import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type SimplbooksTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/simplbooks/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<SimplbooksTransaction> = {}): SimplbooksTransaction {
  return {
    id: 500,
    account_id: 11,
    account_code: '1900',
    currency: 'EUR',
    total: 11900,
    total_vat: 1900,
    payment_method: 'bank_transfer',
    reference: 'REF-001',
    description: 'Payment for INV-101',
    transaction_date: '2024-04-15',
    client_id: 5,
    supplier_id: null,
    ...overrides,
  }
}

describe('transformTransaction (simplbooks)', () => {
  it('maps numeric id to string id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('500')
  })

  it('maps account_id to accountId string', () => {
    expect(transformTransaction(makeRaw()).accountId).toBe('11')
  })

  it('maps reference', () => {
    expect(transformTransaction(makeRaw()).reference).toBe('REF-001')
  })

  it('maps description to memo', () => {
    expect(transformTransaction(makeRaw()).memo).toBe('Payment for INV-101')
  })

  it('maps payment_method to paymentMethod', () => {
    expect(transformTransaction(makeRaw()).paymentMethod).toBe('bank_transfer')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeRaw()).currency).toBe('EUR')
  })

  it('maps total to totalAmount', () => {
    expect(transformTransaction(makeRaw()).totalAmount).toBe(11900)
  })

  it('maps total_vat to taxAmount', () => {
    expect(transformTransaction(makeRaw()).taxAmount).toBe(1900)
  })

  it('maps transaction_date string to Date', () => {
    expect(transformTransaction(makeRaw()).createdAt).toEqual(new Date('2024-04-15'))
  })

  it('maps client_id to contacts array when present', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('5')
  })

  it('maps supplier_id to contacts when client_id absent', () => {
    const result = transformTransaction(makeRaw({ client_id: null, supplier_id: 9 }))
    expect(result.contacts?.[0]?.id).toBe('9')
  })

  it('omits contacts when both ids are null', () => {
    const result = transformTransaction(makeRaw({ client_id: null, supplier_id: null }))
    expect(result.contacts).toBeUndefined()
  })

  it('passes TransactionSchema.parse without throwing', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeRaw()))).not.toThrow()
  })
})
