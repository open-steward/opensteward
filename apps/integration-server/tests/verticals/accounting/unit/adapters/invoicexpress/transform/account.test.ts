import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type InvoiceXpressAccount } from '../../../../../../../src/verticals/accounting/adapters/invoicexpress/transform/account'

function makeAccount(overrides: Partial<InvoiceXpressAccount> = {}): InvoiceXpressAccount {
  return {
    id: 5,
    name: 'Bank Account',
    type: 'asset',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('5')
    expect(result.name).toBe('Bank Account')
    expect(result.type).toBe('ASSET')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount({ name: 'Revenue' })
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps income type', () => {
    expect(transformAccount(makeAccount({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps expense type', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps liability type', () => {
    expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity type', () => {
    expect(transformAccount(makeAccount({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'other_thing' })).type).toBe('OTHER')
  })

  it('returns undefined name when empty', () => {
    const result = transformAccount(makeAccount({ name: '' }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
