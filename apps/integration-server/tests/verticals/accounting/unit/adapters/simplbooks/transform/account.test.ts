import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type SimplbooksAccount,
} from '../../../../../../../src/verticals/accounting/adapters/simplbooks/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<SimplbooksAccount> = {}): SimplbooksAccount {
  return {
    id: 4000,
    code: '4000',
    name: 'Sales Revenue',
    type: 'income',
    is_active: true,
    balance: 50000,
    ...overrides,
  }
}

describe('transformAccount (simplbooks)', () => {
  it('maps numeric id to string id', () => {
    expect(transformAccount(makeRaw()).id).toBe('4000')
  })

  it('maps name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Sales Revenue')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('4000')
  })

  it('maps income type to INCOME', () => {
    expect(transformAccount(makeRaw({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps revenue type to INCOME', () => {
    expect(transformAccount(makeRaw({ type: 'revenue' })).type).toBe('INCOME')
  })

  it('maps asset type to ASSET', () => {
    expect(transformAccount(makeRaw({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps is_active=true to ACTIVE', () => {
    expect(transformAccount(makeRaw({ is_active: true })).status).toBe('ACTIVE')
  })

  it('maps is_active=false to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('maps balance', () => {
    expect(transformAccount(makeRaw()).balance).toBe(50000)
  })

  it('passes AccountSchema.parse without throwing', () => {
    expect(() => AccountSchema.parse(transformAccount(makeRaw()))).not.toThrow()
  })
})
