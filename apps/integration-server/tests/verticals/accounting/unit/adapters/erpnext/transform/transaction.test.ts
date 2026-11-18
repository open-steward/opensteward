import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type ErpNextPaymentEntry } from '../../../../../../../src/verticals/accounting/adapters/erpnext/transform/transaction'

function makeRaw(overrides: Partial<ErpNextPaymentEntry> = {}): ErpNextPaymentEntry {
  return {
    name: 'PE-2024-00001',
    posting_date: '2024-01-15',
    payment_type: 'Receive',
    paid_amount: 1200,
    paid_from_account_currency: 'USD',
    party: 'ACME Corp',
    remarks: 'Invoice payment',
    ...overrides,
  }
}

describe('transformTransaction (ERPNext)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('PE-2024-00001')
    expect(result.totalAmount).toBe(1200)
    expect(result.currency).toBe('USD')
    expect(result.memo).toBe('Invoice payment')
    expect(result.type).toBe('CREDIT')
  })

  it('maps Pay payment type to DEBIT', () => {
    const result = transformTransaction(makeRaw({ payment_type: 'Pay' }))
    expect(result.type).toBe('DEBIT')
  })

  it('maps party to contacts', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('ACME Corp')
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-01-15'))
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
