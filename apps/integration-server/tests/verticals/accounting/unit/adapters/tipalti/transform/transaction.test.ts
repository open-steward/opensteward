import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type TipaltiPayment,
} from '../../../../../../../src/verticals/accounting/adapters/tipalti/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<TipaltiPayment> = {}): TipaltiPayment {
  return {
    id: 'pay-tipalti-001',
    status: 'PAID',
    payeeId: 'payee-42',
    currency: 'USD',
    amount: 5000.0,
    paymentDate: '2024-03-15T00:00:00.000Z',
    paymentMethod: 'ACH',
    referenceCode: 'REF-ACH-001',
    invoiceIds: ['inv-tipalti-001'],
    bankAccountId: 'bank-001',
    createdAt: '2024-03-15T10:00:00.000Z',
    updatedAt: '2024-03-15T11:00:00.000Z',
    ...overrides,
  }
}

describe('tipalti transformTransaction', () => {
  it('maps id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('pay-tipalti-001')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeRaw()).currency).toBe('USD')
  })

  it('maps paymentMethod', () => {
    expect(transformTransaction(makeRaw()).paymentMethod).toBe('ACH')
  })

  it('maps amount to totalAmount (as-is, not minor units)', () => {
    // Tipalti payments are stored as floats, not minor units
    expect(transformTransaction(makeRaw({ amount: 5000.0 })).totalAmount).toBe(5000.0)
  })

  it('maps bankAccountId to accountId', () => {
    expect(transformTransaction(makeRaw()).accountId).toBe('bank-001')
  })

  it('maps payeeId to contacts', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('payee-42')
  })

  it('omits contacts when payeeId absent', () => {
    expect(transformTransaction(makeRaw({ payeeId: undefined })).contacts).toBeUndefined()
  })

  it('uses paymentDate for createdAt (preferred over createdAt)', () => {
    expect(transformTransaction(makeRaw()).createdAt).toEqual(new Date('2024-03-15T00:00:00.000Z'))
  })

  it('falls back to createdAt when paymentDate absent', () => {
    const result = transformTransaction(makeRaw({ paymentDate: undefined }))
    expect(result.createdAt).toEqual(new Date('2024-03-15T10:00:00.000Z'))
  })

  it('maps updatedAt to Date', () => {
    expect(transformTransaction(makeRaw()).updatedAt).toEqual(new Date('2024-03-15T11:00:00.000Z'))
  })

  it('passes TransactionSchema validation', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })
})
