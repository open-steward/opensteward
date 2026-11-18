import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type DaftraAccount } from '../../../../../../../src/verticals/accounting/adapters/daftra/transform/account'

function makeRaw(overrides: Partial<DaftraAccount> = {}): DaftraAccount {
  return {
    id: 'acc1',
    code: '4100',
    name: 'Sales Revenue',
    account_type: 'income',
    active: true,
    ...overrides,
  }
}

describe('transformAccount (daftra)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('acc1')
    expect(result.name).toBe('Sales Revenue')
    expect(result.customerDefinedCode).toBe('4100')
    expect(result.type).toBe('INCOME')
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps income type to INCOME', () => {
    expect(transformAccount(makeRaw({ account_type: 'income' })).type).toBe('INCOME')
  })

  it('maps revenue type to INCOME', () => {
    expect(transformAccount(makeRaw({ account_type: 'revenue' })).type).toBe('INCOME')
  })

  it('maps expense type to EXPENSE', () => {
    expect(transformAccount(makeRaw({ account_type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps asset type to ASSET', () => {
    expect(transformAccount(makeRaw({ account_type: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability type to LIABILITY', () => {
    expect(transformAccount(makeRaw({ account_type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity type to EQUITY', () => {
    expect(transformAccount(makeRaw({ account_type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeRaw({ account_type: 'unknown' })).type).toBe('OTHER')
  })

  it('is case-insensitive for account type mapping', () => {
    expect(transformAccount(makeRaw({ account_type: 'INCOME' })).type).toBe('INCOME')
    expect(transformAccount(makeRaw({ account_type: 'Income' })).type).toBe('INCOME')
  })

  it('maps Active=false to ARCHIVED status', () => {
    expect(transformAccount(makeRaw({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps Active=true to ACTIVE status', () => {
    expect(transformAccount(makeRaw({ active: true })).status).toBe('ACTIVE')
  })

  it('defaults to ACTIVE when Active is undefined', () => {
    const raw = makeRaw()
    delete raw.active
    expect(transformAccount(raw).status).toBe('ACTIVE')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
