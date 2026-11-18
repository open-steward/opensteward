import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type VosFacturesPayment,
} from '../../../../../../../src/verticals/accounting/adapters/vosfactures/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makePayment(overrides: Partial<VosFacturesPayment> = {}): VosFacturesPayment {
  return {
    id: 300,
    name: 'Jan Kowalski',
    paid: '500.00',
    paid_date: '2024-06-20',
    invoice_id: 1001,
    currency: 'PLN',
    kind: 'transfer',
    client_id: 50,
    description: 'Settlement of invoice FV/001',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('300')
    expect(result.currency).toBe('PLN')
    expect(result.paymentMethod).toBe('transfer')
    expect(result.memo).toBe('Settlement of invoice FV/001')
  })

  it('maps paid to totalAmount as decimal', () => {
    const result = transformTransaction(makePayment({ paid: '500.00' }))
    expect(result.totalAmount).toBe(500)
  })

  it('falls back to price when paid absent', () => {
    const result = transformTransaction(makePayment({ paid: undefined, price: '250.50' }))
    expect(result.totalAmount).toBe(250.5)
  })

  it('maps kind to type (uppercased)', () => {
    const result = transformTransaction(makePayment({ kind: 'card' }))
    expect(result.type).toBe('CARD')
  })

  it('defaults type to PAYMENT when kind absent', () => {
    const result = transformTransaction(makePayment({ kind: undefined }))
    expect(result.type).toBe('PAYMENT')
  })

  it('maps invoice_id to reference', () => {
    const result = transformTransaction(makePayment({ invoice_id: 1001 }))
    expect(result.reference).toBe('1001')
  })

  it('maps client_id to contacts', () => {
    const result = transformTransaction(makePayment())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('50')
    expect(result.contacts![0].name).toBe('Jan Kowalski')
  })

  it('uses paid_date as createdAt', () => {
    const result = transformTransaction(makePayment({ paid_date: '2024-06-20' }))
    expect(result.createdAt).toEqual(new Date('2024-06-20'))
  })

  it('passes raw as metadata', () => {
    const raw = makePayment()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformTransaction(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
