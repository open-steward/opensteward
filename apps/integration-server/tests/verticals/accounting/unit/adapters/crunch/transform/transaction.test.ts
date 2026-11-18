import { describe, it, expect } from 'vitest'
import {
  transformPayment,
  type CrunchPaymentDto,
} from '../../../../../../../src/verticals/accounting/adapters/crunch/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makePayment(overrides: Partial<CrunchPaymentDto> = {}): CrunchPaymentDto {
  return {
    id: 888,
    amount: 250.75,
    date: '2026-05-10',
    description: 'Supplier payment',
    amountType: 'DEBIT',
    reference: 'REF-001',
    ...overrides,
  }
}

describe('transformPayment (crunch)', () => {
  it('maps numeric id to string', () => {
    expect(transformPayment(makePayment()).id).toBe('888')
  })

  it('amountType DEBIT → type DEBIT', () => {
    expect(transformPayment(makePayment({ amountType: 'DEBIT' })).type).toBe('DEBIT')
  })

  it('amountType CREDIT → type CREDIT', () => {
    expect(transformPayment(makePayment({ amountType: 'CREDIT' })).type).toBe('CREDIT')
  })

  it('absent amountType → type CREDIT (fallback)', () => {
    expect(transformPayment(makePayment({ amountType: undefined })).type).toBe('CREDIT')
  })

  it('converts float amount to absolute minor units', () => {
    // 250.75 → 25075
    expect(transformPayment(makePayment()).totalAmount).toBe(25075)
  })

  it('handles negative amounts correctly (Math.abs)', () => {
    expect(transformPayment(makePayment({ amount: -100 })).totalAmount).toBe(10000)
  })

  it('maps reference', () => {
    expect(transformPayment(makePayment()).reference).toBe('REF-001')
  })

  it('maps description to memo', () => {
    expect(transformPayment(makePayment()).memo).toBe('Supplier payment')
  })

  it('falls back to paymentName when description absent', () => {
    expect(
      transformPayment(makePayment({ description: undefined, paymentName: 'DD Payment' })).memo,
    ).toBe('DD Payment')
  })

  it('passes accountId parameter through', () => {
    expect(transformPayment(makePayment(), 'bank-42').accountId).toBe('bank-42')
  })

  it('stores _accountId in metadata', () => {
    const result = transformPayment(makePayment(), 'bank-42')
    expect((result.metadata as Record<string, unknown>)['_accountId']).toBe('bank-42')
  })

  it('parses date as createdAt', () => {
    const result = transformPayment(makePayment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt!.toISOString().startsWith('2026-05-10')).toBe(true)
  })

  it('attaches raw fields in metadata', () => {
    const raw = makePayment()
    const result = transformPayment(raw)
    expect((result.metadata as Record<string, unknown>)['id']).toBe(raw.id)
  })

  it('passes TransactionSchema.parse without throwing', () => {
    const result = transformPayment(makePayment(), 'bank-42')
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
