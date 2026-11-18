import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type MisaAmisAccount,
} from '../../../../../../../src/verticals/accounting/adapters/misaamis/transform/account'

function makeRaw(overrides: Partial<MisaAmisAccount> = {}): MisaAmisAccount {
  return {
    id: 'acc-001',
    account_number: '1111',
    account_name: 'Tiền mặt',
    account_type: 'asset',
    is_active: true,
    description: 'Tài khoản tiền mặt',
    balance: 5000000,
    ...overrides,
  }
}

describe('transformAccount (misaamis)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('acc-001')
    expect(result.name).toBe('Tiền mặt')
    expect(result.customerDefinedCode).toBe('1111')
    expect(result.balance).toBe(5000000)
    expect(result.description).toBe('Tài khoản tiền mặt')
  })

  it('maps is_active true to ACTIVE status', () => {
    expect(transformAccount(makeRaw({ is_active: true })).status).toBe('ACTIVE')
  })

  it('maps is_active false to ARCHIVED status', () => {
    expect(transformAccount(makeRaw({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('maps account_type asset to ASSET', () => {
    expect(transformAccount(makeRaw({ account_type: 'asset' })).type).toBe('ASSET')
  })

  it('maps account_type liability to LIABILITY', () => {
    expect(transformAccount(makeRaw({ account_type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps account_type equity to EQUITY', () => {
    expect(transformAccount(makeRaw({ account_type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps account_type income to INCOME', () => {
    expect(transformAccount(makeRaw({ account_type: 'income' })).type).toBe('INCOME')
  })

  it('maps account_type expense to EXPENSE', () => {
    expect(transformAccount(makeRaw({ account_type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps account_type cost to EXPENSE', () => {
    expect(transformAccount(makeRaw({ account_type: 'cost' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeRaw({ account_type: 'unknown' })).type).toBe('OTHER')
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
