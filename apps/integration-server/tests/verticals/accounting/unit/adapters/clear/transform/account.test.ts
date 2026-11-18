import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type ClearAccount,
} from '../../../../../../../src/verticals/accounting/adapters/clear/transform/account'

function makeRaw(overrides: Partial<ClearAccount> = {}): ClearAccount {
  return {
    id: 'acc-uuid-001',
    account_code: 'BANK001',
    account_name: 'HDFC Current Account',
    account_type: 'asset',
    is_active: true,
    balance: 250000,
    ...overrides,
  }
}

describe('transformAccount (clear)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('acc-uuid-001')
    expect(result.name).toBe('HDFC Current Account')
    expect(result.customerDefinedCode).toBe('BANK001')
    expect(result.balance).toBe(250000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps is_active true to ACTIVE', () => {
    const result = transformAccount(makeRaw({ is_active: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps is_active false to ARCHIVED', () => {
    const result = transformAccount(makeRaw({ is_active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps account_type asset to ASSET', () => {
    const result = transformAccount(makeRaw({ account_type: 'asset' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps account_type liability to LIABILITY', () => {
    const result = transformAccount(makeRaw({ account_type: 'liability' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps account_type income to INCOME', () => {
    const result = transformAccount(makeRaw({ account_type: 'income' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps account_type expense to EXPENSE', () => {
    const result = transformAccount(makeRaw({ account_type: 'expense' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
