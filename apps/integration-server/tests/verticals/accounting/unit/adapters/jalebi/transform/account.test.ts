import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type JalebiItem } from '../../../../../../../src/verticals/accounting/adapters/jalebi/transform/account'

function makeRaw(overrides: Partial<JalebiItem> = {}): JalebiItem {
  return {
    id: 'ITEM-001',
    code: 'FOOD-001',
    name: 'Chicken Shawarma',
    category: 'Main Course',
    active: true,
    price: 45.0,
    ...overrides,
  }
}

describe('transformAccount (jalebi)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('ITEM-001')
    expect(result.name).toBe('Chicken Shawarma')
    expect(result.customerDefinedCode).toBe('FOOD-001')
    expect(result.group).toBe('Main Course')
  })

  it('maps active status to ACTIVE', () => {
    const result = transformAccount(makeRaw({ active: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive status to ARCHIVED', () => {
    const result = transformAccount(makeRaw({ active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits name when name is empty', () => {
    const result = transformAccount(makeRaw({ name: '' }))
    expect(result.name).toBeUndefined()
  })

  it('omits customerDefinedCode when code is empty', () => {
    const result = transformAccount(makeRaw({ code: '' }))
    expect(result.customerDefinedCode).toBeUndefined()
  })

  it('omits group when category is empty', () => {
    const result = transformAccount(makeRaw({ category: '' }))
    expect(result.group).toBeUndefined()
  })

  it('handles numeric id correctly', () => {
    const result = transformAccount(makeRaw({ id: 55 }))
    expect(result.id).toBe('55')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
