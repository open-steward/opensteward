import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type DualentryAccount,
} from '../../../../../../../src/verticals/accounting/adapters/dualentry/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<DualentryAccount> = {}): DualentryAccount {
  return {
    id: 42,
    name: 'Cash',
    number: 1000,
    description: 'Main cash account',
    is_active: true,
    is_system: false,
    company_id: 1,
    parent_account_id: null,
    account_type: 'ASSET',
    currency_iso_4217_code: 'USD',
    ...overrides,
  }
}

describe('dualentry transformAccount', () => {
  it('maps id to string id', () => {
    const result = transformAccount(makeRaw({ id: 99 }))
    expect(result.id).toBe('99')
  })

  it('maps number to customerDefinedCode as string', () => {
    const result = transformAccount(makeRaw({ number: 4000 }))
    expect(result.customerDefinedCode).toBe('4000')
  })

  it('is_active=true → status ACTIVE', () => {
    const result = transformAccount(makeRaw({ is_active: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('is_active=false → status ARCHIVED', () => {
    const result = transformAccount(makeRaw({ is_active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('account_type ASSET → type ASSET', () => {
    const result = transformAccount(makeRaw({ account_type: 'ASSET' }))
    expect(result.type).toBe('ASSET')
  })

  it('account_type containing LIAB → type LIABILITY', () => {
    const result = transformAccount(makeRaw({ account_type: 'LIABILITIES' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('account_type containing REVENUE → type INCOME', () => {
    const result = transformAccount(makeRaw({ account_type: 'REVENUE' }))
    expect(result.type).toBe('INCOME')
  })

  it('account_type containing EXPENSE → type EXPENSE', () => {
    const result = transformAccount(makeRaw({ account_type: 'EXPENSE' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps parent_account_id to parentId as string', () => {
    const result = transformAccount(makeRaw({ parent_account_id: 5 }))
    expect(result.parentId).toBe('5')
  })

  it('null parent_account_id → parentId undefined', () => {
    const result = transformAccount(makeRaw({ parent_account_id: null }))
    expect(result.parentId).toBeUndefined()
  })

  it('maps currency_iso_4217_code to currency', () => {
    const result = transformAccount(makeRaw({ currency_iso_4217_code: 'EUR' }))
    expect(result.currency).toBe('EUR')
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes AccountSchema.parse without throwing', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
