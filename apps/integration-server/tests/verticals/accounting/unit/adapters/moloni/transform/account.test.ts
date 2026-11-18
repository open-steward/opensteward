import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type MoloniAccount } from '../../../../../../../src/verticals/accounting/adapters/moloni/transform/account'

function makeAccount(overrides: Partial<MoloniAccount> = {}): MoloniAccount {
  return {
    account_id: 10,
    description: 'Cash Account',
    type: 'asset',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('10')
    expect(result.name).toBe('Cash Account')
    expect(result.type).toBe('ASSET')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount({ description: 'Test' })
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps asset type', () => {
    expect(transformAccount(makeAccount({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability type', () => {
    expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity type', () => {
    expect(transformAccount(makeAccount({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps income type', () => {
    expect(transformAccount(makeAccount({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps expense type', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'unknown_type' })).type).toBe('OTHER')
  })

  it('returns undefined name when description is empty', () => {
    const result = transformAccount(makeAccount({ description: '' }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
