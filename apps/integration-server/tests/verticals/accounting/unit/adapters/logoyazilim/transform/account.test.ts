import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type LogoAccount } from '../../../../../../../src/verticals/accounting/adapters/logoyazilim/transform/account'

function makeAccount(overrides: Partial<LogoAccount> = {}): LogoAccount {
  return {
    id: '300',
    Code: '1100',
    Name: 'Cash and Cash Equivalents',
    Type: 'Asset',
    Balance: 125000,
    ...overrides,
  }
}

describe('transformAccount (logoyazilim)', () => {
  it('maps id correctly', () => {
    expect(transformAccount(makeAccount()).id).toBe('300')
  })

  it('maps name and customerDefinedCode', () => {
    const a = transformAccount(makeAccount())
    expect(a.name).toBe('Cash and Cash Equivalents')
    expect(a.customerDefinedCode).toBe('1100')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(125000)
  })

  it('maps Asset type to ASSET', () => {
    expect(transformAccount(makeAccount({ Type: 'Asset' })).type).toBe('ASSET')
  })

  it('maps Liability type to LIABILITY', () => {
    expect(transformAccount(makeAccount({ Type: 'Liability' })).type).toBe('LIABILITY')
  })

  it('maps Equity type to EQUITY', () => {
    expect(transformAccount(makeAccount({ Type: 'Equity' })).type).toBe('EQUITY')
  })

  it('maps Income type to INCOME', () => {
    expect(transformAccount(makeAccount({ Type: 'Income' })).type).toBe('INCOME')
  })

  it('maps Expense type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ Type: 'Expense' })).type).toBe('EXPENSE')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('handles unknown type gracefully', () => {
    const a = transformAccount(makeAccount({ Type: 'Unknown' }))
    expect(a.type).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
