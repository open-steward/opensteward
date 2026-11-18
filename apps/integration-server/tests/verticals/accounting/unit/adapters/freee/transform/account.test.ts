import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type FreeeAccountItem } from '../../../../../../../src/verticals/accounting/adapters/freee/transform/account'

function makeRaw(overrides: Partial<FreeeAccountItem> = {}): FreeeAccountItem {
  return {
    id: 300,
    name: 'Sales Revenue',
    account_category: 'income',
    available: true,
    shortcut: 'SALES',
    shortcut_num: '300',
    ...overrides,
  }
}

describe('transformAccount (freee)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('300')
    expect(result.name).toBe('Sales Revenue')
    expect(result.customerDefinedCode).toBe('300')
  })

  it('maps available=true to ACTIVE status', () => {
    const result = transformAccount(makeRaw({ available: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps available=false to ARCHIVED status', () => {
    const result = transformAccount(makeRaw({ available: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps income category to INCOME type', () => {
    const result = transformAccount(makeRaw({ account_category: 'income' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps expense category to EXPENSE type', () => {
    const result = transformAccount(makeRaw({ account_category: 'expense' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps asset category to ASSET type', () => {
    const result = transformAccount(makeRaw({ account_category: 'asset' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps liability category to LIABILITY type', () => {
    const result = transformAccount(makeRaw({ account_category: 'liability' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps equity category to EQUITY type', () => {
    const result = transformAccount(makeRaw({ account_category: 'equity' }))
    expect(result.type).toBe('EQUITY')
  })

  it('uses shortcut when shortcut_num is null', () => {
    const result = transformAccount(makeRaw({ shortcut_num: null, shortcut: 'SLS' }))
    expect(result.customerDefinedCode).toBe('SLS')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
