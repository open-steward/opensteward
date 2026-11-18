import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type MekariJurnalAccount } from '../../../../../../../src/verticals/accounting/adapters/mekarijurnal/transform/account'

function makeAccount(overrides: Partial<MekariJurnalAccount> = {}): MekariJurnalAccount {
  return {
    id: 1001,
    number: '1-1000',
    name: 'Kas dan Bank',
    category: 'Asset',
    balance: 10000000,
    ...overrides,
  }
}

describe('transformAccount (mekarijurnal)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('1001')
    expect(result.name).toBe('Kas dan Bank')
    expect(result.customerDefinedCode).toBe('1-1000')
    expect(result.balance).toBe(10000000)
  })

  it('maps asset category to ASSET type', () => {
    const result = transformAccount(makeAccount({ category: 'Asset' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps liability category to LIABILITY type', () => {
    const result = transformAccount(makeAccount({ category: 'Liability' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps equity category to EQUITY type', () => {
    const result = transformAccount(makeAccount({ category: 'equity' }))
    expect(result.type).toBe('EQUITY')
  })

  it('maps income category to INCOME type', () => {
    const result = transformAccount(makeAccount({ category: 'income' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps expense category to EXPENSE type', () => {
    const result = transformAccount(makeAccount({ category: 'expense' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps Indonesian "aktiva" category to ASSET', () => {
    const result = transformAccount(makeAccount({ category: 'aktiva' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps unknown category to OTHER', () => {
    const result = transformAccount(makeAccount({ category: 'unknown_type' }))
    expect(result.type).toBe('OTHER')
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
