import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type DolibarrBankTransaction } from '../../../../../../../src/verticals/accounting/adapters/dolibarr/transform/transaction'

function makeRaw(overrides: Partial<DolibarrBankTransaction> = {}): DolibarrBankTransaction {
  return {
    rowid: 101,
    datev: 1705276800,
    label: 'Virement client',
    amount: 1200,
    fk_account: 3,
    num_chq: 'VIR-001',
    ...overrides,
  }
}

describe('transformTransaction (Dolibarr)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('101')
    expect(result.memo).toBe('Virement client')
    expect(result.totalAmount).toBe(1200)
    expect(result.accountId).toBe('3')
    expect(result.reference).toBe('VIR-001')
  })

  it('parses unix timestamp as Date', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
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
