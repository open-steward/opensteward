import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type KwaraSavingsProduct } from '../../../../../../../src/verticals/accounting/adapters/kwara/transform/account'

function makeRaw(overrides: Partial<KwaraSavingsProduct> = {}): KwaraSavingsProduct {
  return {
    id: 'prod-001',
    name: 'Regular Savings',
    identifier: 'REG-SAV',
    product_type: 'savings',
    state: 'active',
    ...overrides,
  }
}

describe('transformAccount (Kwara)', () => {
  it('maps core fields correctly', () => {
    const r = transformAccount(makeRaw())
    expect(r.id).toBe('prod-001')
    expect(r.name).toBe('Regular Savings')
    expect(r.customerDefinedCode).toBe('REG-SAV')
  })

  it('maps savings product_type to ASSET', () => {
    expect(transformAccount(makeRaw({ product_type: 'savings' })).type).toBe('ASSET')
  })

  it('maps loan product_type to LIABILITY', () => {
    expect(transformAccount(makeRaw({ product_type: 'loan' })).type).toBe('LIABILITY')
  })

  it('maps active state to ACTIVE status', () => {
    expect(transformAccount(makeRaw({ state: 'active' })).status).toBe('ACTIVE')
  })

  it('maps inactive state to ARCHIVED status', () => {
    expect(transformAccount(makeRaw({ state: 'inactive' })).status).toBe('ARCHIVED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
