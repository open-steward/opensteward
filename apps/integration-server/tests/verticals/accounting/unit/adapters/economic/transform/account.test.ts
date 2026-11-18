import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type EconomicAccount } from '../../../../../../../src/verticals/accounting/adapters/economic/transform/account'

function makeRaw(overrides: Partial<EconomicAccount> = {}): EconomicAccount {
  return {
    accountNumber: 1000,
    name: 'Cash',
    accountType: 'status',
    debitCredit: 'debit',
    barred: false,
    balance: 0,
    accountGroup: null,
    vatAccount: null,
    ...overrides,
  }
}

describe('economic transformAccount', () => {
  it('maps accountNumber to id', () => {
    expect(transformAccount(makeRaw()).id).toBe('1000')
  })
  it('handles fields gracefully', () => {
    expect(() => transformAccount(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformAccount(raw).metadata).toBe(raw)
  })
  it('maps barred true -> ARCHIVED', () => {
    expect(transformAccount(makeRaw({ barred: true })).status).toBe('ARCHIVED')
  })
  it('maps barred false -> ACTIVE', () => {
    expect(transformAccount(makeRaw({ barred: false })).status).toBe('ACTIVE')
  })
  it('maps profitandloss type -> INCOME', () => {
    expect(transformAccount(makeRaw({ accountType: 'profitandloss' })).type).toBe('INCOME')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
