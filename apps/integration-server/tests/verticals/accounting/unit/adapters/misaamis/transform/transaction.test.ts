import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type MisaAmisBankTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/misaamis/transform/transaction'

function makeRaw(overrides: Partial<MisaAmisBankTransaction> = {}): MisaAmisBankTransaction {
  return {
    id: 'txn-001',
    transaction_date: '2024-03-10',
    amount: 5000000,
    transaction_type: 'receipt',
    description: 'Thu tiền khách hàng',
    reference: 'REF-001',
    bank_account_id: 'bank-acc-001',
    partner_id: 'partner-001',
    ...overrides,
  }
}

describe('transformTransaction (misaamis)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('txn-001')
    expect(result.accountId).toBe('bank-acc-001')
    expect(result.type).toBe('receipt')
    expect(result.reference).toBe('REF-001')
    expect(result.memo).toBe('Thu tiền khách hàng')
    expect(result.totalAmount).toBe(5000000)
  })

  it('parses transaction_date as Date object', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles payment type', () => {
    const result = transformTransaction(makeRaw({ transaction_type: 'payment' }))
    expect(result.type).toBe('payment')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
