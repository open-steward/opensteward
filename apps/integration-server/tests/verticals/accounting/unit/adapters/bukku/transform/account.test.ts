import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type BukkuAccount } from '../../../../../../../src/verticals/accounting/adapters/bukku/transform/account'

function makeRaw(overrides: Partial<BukkuAccount> = {}): BukkuAccount {
  return {
    id: '10',
    code: '4-001',
    name: 'Sales Revenue',
    type: 'income',
    active: true,
    description: 'Revenue from sales',
    ...overrides,
  }
}

describe('transformAccount (bukku)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('10')
    expect(result.customerDefinedCode).toBe('4-001')
    expect(result.name).toBe('Sales Revenue')
    expect(result.description).toBe('Revenue from sales')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ code: 'X-001' })
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['code']).toBe('X-001')
  })

  it('maps active to ACTIVE status', () => {
    const result = transformAccount(makeRaw({ active: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive to ARCHIVED status', () => {
    const result = transformAccount(makeRaw({ active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps asset type', () => {
    const result = transformAccount(makeRaw({ type: 'asset' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps liability type', () => {
    const result = transformAccount(makeRaw({ type: 'liability' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps equity type', () => {
    const result = transformAccount(makeRaw({ type: 'equity' }))
    expect(result.type).toBe('EQUITY')
  })

  it('maps income type', () => {
    const result = transformAccount(makeRaw({ type: 'income' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps expense type', () => {
    const result = transformAccount(makeRaw({ type: 'expense' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    const result = transformAccount(makeRaw({ type: 'other' }))
    expect(result.type).toBe('OTHER')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
