import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type BCAccount } from '../../../../../../../src/verticals/accounting/adapters/dynamics365bc/transform/account'

function makeAccount(overrides: Partial<BCAccount> = {}): BCAccount {
  return {
    id: 'acct-1',
    number: '1000',
    displayName: 'Cash',
    category: 'Assets',
    blocked: false,
    ...overrides,
  }
}

describe('transformAccount (dynamics365bc)', () => {
  it('maps id, code and name', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acct-1')
    expect(result.customerDefinedCode).toBe('1000')
    expect(result.name).toBe('Cash')
  })

  it('maps category Assets → ASSET', () => {
    expect(transformAccount(makeAccount({ category: 'Assets' })).type).toBe('ASSET')
  })

  it('maps category Liabilities → LIABILITY', () => {
    expect(transformAccount(makeAccount({ category: 'Liabilities' })).type).toBe('LIABILITY')
  })

  it('maps category Equity → EQUITY', () => {
    expect(transformAccount(makeAccount({ category: 'Equity' })).type).toBe('EQUITY')
  })

  it('maps category Income → INCOME', () => {
    expect(transformAccount(makeAccount({ category: 'Income' })).type).toBe('INCOME')
  })

  it('maps category Expense → EXPENSE', () => {
    expect(transformAccount(makeAccount({ category: 'Expense' })).type).toBe('EXPENSE')
  })

  it('maps blocked false → ACTIVE', () => {
    expect(transformAccount(makeAccount({ blocked: false })).status).toBe('ACTIVE')
  })

  it('maps blocked true → ARCHIVED', () => {
    expect(transformAccount(makeAccount({ blocked: true })).status).toBe('ARCHIVED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
