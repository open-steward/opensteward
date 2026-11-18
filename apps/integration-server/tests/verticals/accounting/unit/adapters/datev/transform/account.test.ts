import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type DatevAccount } from '../../../../../../../src/verticals/accounting/adapters/datev/transform/account'

function makeAccount(overrides: Partial<DatevAccount> = {}): DatevAccount {
  return {
    id: 'acc-001',
    account_number: '1200',
    name: 'Forderungen aus LuL',
    account_type: 'asset',
    active: true,
    description: 'Accounts receivable',
    ...overrides,
  }
}

describe('transformAccount (DATEV)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-001')
    expect(result.name).toBe('Forderungen aus LuL')
    expect(result.customerDefinedCode).toBe('1200')
    expect(result.type).toBe('ASSET')
    expect(result.status).toBe('ACTIVE')
  })

  it('marks inactive accounts as ARCHIVED', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps liability type', () => {
    expect(transformAccount(makeAccount({ account_type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity type', () => {
    expect(transformAccount(makeAccount({ account_type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps income type', () => {
    expect(transformAccount(makeAccount({ account_type: 'income' })).type).toBe('INCOME')
  })

  it('maps expense type', () => {
    expect(transformAccount(makeAccount({ account_type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ account_type: 'unknown' })).type).toBe('OTHER')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
