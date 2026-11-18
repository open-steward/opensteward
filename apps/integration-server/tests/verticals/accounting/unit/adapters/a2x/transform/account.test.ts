import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type A2xAccount,
} from '../../../../../../../src/verticals/accounting/adapters/a2x/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeA2xAccount(overrides: Partial<A2xAccount> = {}): A2xAccount {
  return {
    id: 1001,
    code: '4000',
    name: 'Sales Revenue',
    type: 'income',
    active: true,
    currency: 'USD',
    description: 'Revenue from product sales',
    ...overrides,
  }
}

describe('transformAccount (a2x)', () => {
  it('maps core identity fields', () => {
    const result = transformAccount(makeA2xAccount())
    expect(result.id).toBe('1001')
    expect(result.customerDefinedCode).toBe('4000')
    expect(result.name).toBe('Sales Revenue')
    expect(result.description).toBe('Revenue from product sales')
  })

  it('maps income type correctly', () => {
    const result = transformAccount(makeA2xAccount({ type: 'income' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps revenue type to INCOME', () => {
    const result = transformAccount(makeA2xAccount({ type: 'revenue' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps asset type correctly', () => {
    const result = transformAccount(makeA2xAccount({ type: 'asset' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps bank type to ASSET', () => {
    const result = transformAccount(makeA2xAccount({ type: 'bank' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps liability type correctly', () => {
    const result = transformAccount(makeA2xAccount({ type: 'liability' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps equity type correctly', () => {
    const result = transformAccount(makeA2xAccount({ type: 'equity' }))
    expect(result.type).toBe('EQUITY')
  })

  it('maps expense type correctly', () => {
    const result = transformAccount(makeA2xAccount({ type: 'expense' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps cogs to EXPENSE', () => {
    const result = transformAccount(makeA2xAccount({ type: 'cogs' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    const result = transformAccount(makeA2xAccount({ type: 'unknown_type' }))
    expect(result.type).toBe('OTHER')
  })

  it('sets status ACTIVE when active=true', () => {
    const result = transformAccount(makeA2xAccount({ active: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('sets status ARCHIVED when active=false', () => {
    const result = transformAccount(makeA2xAccount({ active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps currency', () => {
    const result = transformAccount(makeA2xAccount({ currency: 'EUR' }))
    expect(result.currency).toBe('EUR')
  })

  it('passes AccountSchema.parse without throwing', () => {
    const result = transformAccount(makeA2xAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })

  it('omits optional fields when absent', () => {
    const raw = makeA2xAccount({ description: undefined, currency: undefined })
    const result = transformAccount(raw)
    expect(result.description).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })
})
