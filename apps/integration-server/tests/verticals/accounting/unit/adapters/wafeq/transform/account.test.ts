import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type WafeqAccount } from '../../../../../../../src/verticals/accounting/adapters/wafeq/transform/account'

function makeRaw(overrides: Partial<WafeqAccount> = {}): WafeqAccount {
  return {
    id: 'acc1',
    code: '4000',
    name: 'Revenue',
    type: 'income',
    is_active: true,
    ...overrides,
  }
}

describe('transformAccount (wafeq)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('acc1')
    expect(result.name).toBe('Revenue')
    expect(result.customerDefinedCode).toBe('4000')
    expect(result.type).toBe('INCOME')
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps income type to INCOME', () => {
    expect(transformAccount(makeRaw({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps expense type to EXPENSE', () => {
    expect(transformAccount(makeRaw({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps asset type to ASSET', () => {
    expect(transformAccount(makeRaw({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability type to LIABILITY', () => {
    expect(transformAccount(makeRaw({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity type to EQUITY', () => {
    expect(transformAccount(makeRaw({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('returns undefined type for unknown account type', () => {
    expect(transformAccount(makeRaw({ type: 'unknown' })).type).toBeUndefined()
  })

  it('maps is_active=false to ARCHIVED status', () => {
    expect(transformAccount(makeRaw({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('maps is_active=true to ACTIVE status', () => {
    expect(transformAccount(makeRaw({ is_active: true })).status).toBe('ACTIVE')
  })

  it('defaults to ACTIVE status when is_active is undefined', () => {
    const raw = makeRaw()
    delete raw.is_active
    expect(transformAccount(raw).status).toBe('ACTIVE')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
