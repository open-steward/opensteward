import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type WintAccount,
} from '../../../../../../../src/verticals/accounting/adapters/wint/transform/account'

function makeAccount(overrides: Partial<WintAccount> = {}): WintAccount {
  return {
    id: 300,
    number: '1930',
    name: 'Bank',
    type: 'asset',
    active: true,
    ...overrides,
  }
}

describe('transformAccount (Wint)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('300')
    expect(result.name).toBe('Bank')
    expect(result.customerDefinedCode).toBe('1930')
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

  it('maps revenue type to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'revenue' })).type).toBe('INCOME')
  })

  it('maps cost type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'cost' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'special' })).type).toBe('OTHER')
  })

  it('returns undefined type when type absent', () => {
    expect(transformAccount(makeAccount({ type: undefined })).type).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles numeric account number', () => {
    const result = transformAccount(makeAccount({ number: 2440 }))
    expect(result.customerDefinedCode).toBe('2440')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
