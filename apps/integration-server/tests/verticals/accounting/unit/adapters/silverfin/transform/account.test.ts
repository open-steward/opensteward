import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type SilverfinAccount } from '../../../../../../../src/verticals/accounting/adapters/silverfin/transform/account'

function makeAccount(overrides: Partial<SilverfinAccount> = {}): SilverfinAccount {
  return {
    id: '100',
    name: 'Cash and cash equivalents',
    number: '5500',
    account_type: 'asset',
    value: 15000,
    ...overrides,
  }
}

describe('transformAccount (Silverfin)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('100')
    expect(result.name).toBe('Cash and cash equivalents')
    expect(result.customerDefinedCode).toBe('5500')
    expect(result.balance).toBe(15000)
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps asset account type', () => {
    const result = transformAccount(makeAccount({ account_type: 'asset' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps liability account type', () => {
    const result = transformAccount(makeAccount({ account_type: 'liability' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps equity account type', () => {
    const result = transformAccount(makeAccount({ account_type: 'equity' }))
    expect(result.type).toBe('EQUITY')
  })

  it('maps income account type', () => {
    const result = transformAccount(makeAccount({ account_type: 'income' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps expense account type', () => {
    const result = transformAccount(makeAccount({ account_type: 'expense' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('falls back to OTHER for unknown account type', () => {
    const result = transformAccount(makeAccount({ account_type: 'unknown' }))
    expect(result.type).toBe('OTHER')
  })

  it('handles string value via parseDecimal', () => {
    const result = transformAccount(makeAccount({ value: '1234.56' }))
    expect(result.balance).toBe(1234.56)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
