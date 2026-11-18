import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type GustoTransaction } from '../../../../../../../src/verticals/accounting/adapters/gusto/transform/transaction'

function makeTransaction(overrides: Partial<GustoTransaction> = {}): GustoTransaction {
  return {
    id: 'txn_001',
    date: '2024-03-15',
    description: 'Payroll disbursement',
    amount: 3800,
    currency: 'USD',
    employee_id: 'emp_42',
    ...overrides,
  }
}

describe('transformTransaction (Gusto)', () => {
  it('maps id to string', () => {
    expect(transformTransaction(makeTransaction({ id: 'txn_001' })).id).toBe('txn_001')
  })

  it('maps numeric id to string', () => {
    expect(transformTransaction(makeTransaction({ id: 7 })).id).toBe('7')
  })

  it('maps description to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Payroll disbursement')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction({ amount: 1500 })).totalAmount).toBe(1500)
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction({ currency: 'CAD' })).currency).toBe('CAD')
  })

  it('defaults currency to USD when absent', () => {
    const raw = makeTransaction()
    delete raw.currency
    expect(transformTransaction(raw).currency).toBe('USD')
  })

  it('maps employee_id to contacts array', () => {
    const result = transformTransaction(makeTransaction({ employee_id: 'emp_99' }))
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('emp_99')
  })

  it('parses date as Date object', () => {
    expect(transformTransaction(makeTransaction({ date: '2024-03-15' })).createdAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction({ id: 'txn_001' }))
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
