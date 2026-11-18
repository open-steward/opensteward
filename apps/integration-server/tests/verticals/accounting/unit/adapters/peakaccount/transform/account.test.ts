import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type PeakAccountAccount } from '../../../../../../../src/verticals/accounting/adapters/peakaccount/transform/account'

function makeAccount(overrides: Partial<PeakAccountAccount> = {}): PeakAccountAccount {
  return {
    id: 'ACC-001',
    code: '1100',
    name: 'Cash and Cash Equivalents',
    accountType: 'asset',
    balance: 50000,
    currency: 'THB',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('ACC-001')
    expect(result.name).toBe('Cash and Cash Equivalents')
    expect(result.customerDefinedCode).toBe('1100')
    expect(result.balance).toBe(50000)
    expect(result.currency).toBe('THB')
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps asset account type', () => {
    expect(transformAccount(makeAccount({ accountType: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability account type', () => {
    expect(transformAccount(makeAccount({ accountType: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity account type', () => {
    expect(transformAccount(makeAccount({ accountType: 'equity' })).type).toBe('EQUITY')
  })

  it('maps income account type', () => {
    expect(transformAccount(makeAccount({ accountType: 'income' })).type).toBe('INCOME')
  })

  it('maps expense account type', () => {
    expect(transformAccount(makeAccount({ accountType: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown account type to OTHER', () => {
    expect(transformAccount(makeAccount({ accountType: 'other' })).type).toBe('OTHER')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
