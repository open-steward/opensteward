import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type FinancioAccount } from '../../../../../../../src/verticals/accounting/adapters/financio/transform/account'

function makeRaw(overrides: Partial<FinancioAccount> = {}): FinancioAccount {
  return {
    id: '5',
    code: '4-001',
    name: 'Service Revenue',
    type: 'income',
    description: 'Revenue from services',
    is_active: true,
    ...overrides,
  }
}

describe('transformAccount (financio)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('5')
    expect(result.customerDefinedCode).toBe('4-001')
    expect(result.name).toBe('Service Revenue')
    expect(result.description).toBe('Revenue from services')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ code: 'X-999' })
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['code']).toBe('X-999')
  })

  it('maps is_active true to ACTIVE', () => {
    expect(transformAccount(makeRaw({ is_active: true })).status).toBe('ACTIVE')
  })

  it('maps is_active false to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('maps asset type', () => {
    expect(transformAccount(makeRaw({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability type', () => {
    expect(transformAccount(makeRaw({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity type', () => {
    expect(transformAccount(makeRaw({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps income type', () => {
    expect(transformAccount(makeRaw({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps expense type', () => {
    expect(transformAccount(makeRaw({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeRaw({ type: 'other_type' })).type).toBe('OTHER')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
