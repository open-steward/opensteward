import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type AcconomyAccount,
} from '../../../../../../../src/verticals/accounting/adapters/acconomy/transform/account'

function makeAccount(overrides: Partial<AcconomyAccount> = {}): AcconomyAccount {
  return {
    id: 2001,
    code: '4000',
    name: 'Revenue',
    type: 'income',
    is_active: true,
    ...overrides,
  }
}

describe('transformAccount (Acconomy)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('2001')
    expect(result.name).toBe('Revenue')
    expect(result.customerDefinedCode).toBe('4000')
    expect(result.type).toBe('INCOME')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps is_active false to ARCHIVED status', () => {
    const result = transformAccount(makeAccount({ is_active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps is_active true to ACTIVE status', () => {
    const result = transformAccount(makeAccount({ is_active: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('defaults to ACTIVE when is_active is not set', () => {
    const raw = makeAccount()
    delete raw.is_active
    const result = transformAccount(raw)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps asset type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps expense type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'custom_type' })).type).toBe('OTHER')
  })

  it('returns undefined type when type is not set', () => {
    const raw = makeAccount()
    delete raw.type
    expect(transformAccount(raw).type).toBeUndefined()
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
