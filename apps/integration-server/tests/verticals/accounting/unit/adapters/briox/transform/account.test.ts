import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type BrioxAccount,
} from '../../../../../../../src/verticals/accounting/adapters/briox/transform/account'

function makeAccount(overrides: Partial<BrioxAccount> = {}): BrioxAccount {
  return {
    id: 200,
    number: '1500',
    name: 'Kundfordringar',
    type: 'asset',
    active: true,
    ...overrides,
  }
}

describe('transformAccount (Briox)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('200')
    expect(result.name).toBe('Kundfordringar')
    expect(result.customerDefinedCode).toBe('1500')
    expect(result.type).toBe('ASSET')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps active false to ARCHIVED', () => {
    const result = transformAccount(makeAccount({ active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps liability type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps income type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps expense type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'custom' })).type).toBe('OTHER')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles numeric account number', () => {
    const result = transformAccount(makeAccount({ number: 3000 }))
    expect(result.customerDefinedCode).toBe('3000')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
