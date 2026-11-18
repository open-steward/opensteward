import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type AutocountAccount,
} from '../../../../../../../src/verticals/accounting/adapters/autocount/transform/account'

function makeRaw(overrides: Partial<AutocountAccount> = {}): AutocountAccount {
  return {
    AccNo: '100-000',
    Description: 'Cash at Bank',
    AccType: 'asset',
    IsActive: true,
    Balance: 50000,
    ...overrides,
  }
}

describe('transformAccount (autocount)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('100-000')
    expect(result.name).toBe('Cash at Bank')
    expect(result.customerDefinedCode).toBe('100-000')
    expect(result.balance).toBe(50000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps IsActive true to ACTIVE status', () => {
    const result = transformAccount(makeRaw({ IsActive: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps IsActive false to ARCHIVED status', () => {
    const result = transformAccount(makeRaw({ IsActive: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps AccType asset to ASSET', () => {
    const result = transformAccount(makeRaw({ AccType: 'asset' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps AccType liability to LIABILITY', () => {
    const result = transformAccount(makeRaw({ AccType: 'liability' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps AccType equity to EQUITY', () => {
    const result = transformAccount(makeRaw({ AccType: 'equity' }))
    expect(result.type).toBe('EQUITY')
  })

  it('maps AccType income to INCOME', () => {
    const result = transformAccount(makeRaw({ AccType: 'income' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps AccType expense to EXPENSE', () => {
    const result = transformAccount(makeRaw({ AccType: 'expense' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps unknown AccType to undefined', () => {
    const result = transformAccount(makeRaw({ AccType: 'unknown' }))
    expect(result.type).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
