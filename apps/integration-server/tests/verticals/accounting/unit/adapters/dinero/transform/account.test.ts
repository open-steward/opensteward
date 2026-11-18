import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type DineroAccount } from '../../../../../../../src/verticals/accounting/adapters/dinero/transform/account'

function makeAccount(overrides: Partial<DineroAccount> = {}): DineroAccount {
  return {
    AccountNumber: 1000,
    Name: 'Cash',
    AccountType: 'Asset',
    IsActive: true,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps AccountNumber to id as string', () => {
    expect(transformAccount(makeAccount()).id).toBe('1000')
  })

  it('maps AccountNumber to customerDefinedCode as string', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('1000')
  })

  it('maps Name to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Cash')
  })

  it('maps IsActive=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ IsActive: true })).status).toBe('ACTIVE')
  })

  it('maps IsActive=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ IsActive: false })).status).toBe('ARCHIVED')
  })

  it('maps Asset type to ASSET', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Asset' })).type).toBe('ASSET')
  })

  it('maps Liability type to LIABILITY', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Liability' })).type).toBe('LIABILITY')
  })

  it('maps Equity type to EQUITY', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Equity' })).type).toBe('EQUITY')
  })

  it('maps Revenue type to INCOME', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Revenue' })).type).toBe('INCOME')
  })

  it('maps Expense type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Expense' })).type).toBe('EXPENSE')
  })

  it('returns undefined name when Name is empty', () => {
    expect(transformAccount(makeAccount({ Name: '' })).name).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    const a = transformAccount(raw)
    expect(a.metadata).toBe(raw)
    expect((a.metadata as Record<string, unknown>)['AccountType']).toBe('Asset')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
