import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type QoyodAccount,
} from '../../../../../../../src/verticals/accounting/adapters/qoyod/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<QoyodAccount> = {}): QoyodAccount {
  return {
    id: 101,
    name: 'Cash',
    code: 'CASH-101',
    account_type: 'Current Assets',
    parent_id: 50,
    is_active: true,
    ...overrides,
  }
}

describe('qoyod transformAccount', () => {
  it('maps numeric id to string', () => {
    expect(transformAccount(makeRaw()).id).toBe('101')
  })

  it('maps name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Cash')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('CASH-101')
  })

  it('falls back to String(id) when code absent', () => {
    expect(transformAccount(makeRaw({ code: null })).customerDefinedCode).toBe('101')
  })

  it('maps asset account_type to ASSET', () => {
    expect(transformAccount(makeRaw({ account_type: 'Current Assets' })).type).toBe('ASSET')
  })

  it('maps liability account_type to LIABILITY', () => {
    expect(transformAccount(makeRaw({ account_type: 'Current Liabilities' })).type).toBe(
      'LIABILITY',
    )
  })

  it('maps equity account_type to EQUITY', () => {
    expect(transformAccount(makeRaw({ account_type: 'Equity' })).type).toBe('EQUITY')
  })

  it('maps income account_type to INCOME', () => {
    expect(transformAccount(makeRaw({ account_type: 'Income' })).type).toBe('INCOME')
  })

  it('maps expense account_type to EXPENSE', () => {
    expect(transformAccount(makeRaw({ account_type: 'Operating Expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown account_type to OTHER', () => {
    expect(transformAccount(makeRaw({ account_type: 'Special' })).type).toBe('OTHER')
  })

  it('maps is_active=true to ACTIVE', () => {
    expect(transformAccount(makeRaw({ is_active: true })).status).toBe('ACTIVE')
  })

  it('maps is_active=false to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('maps parent_id to parentId as string', () => {
    expect(transformAccount(makeRaw()).parentId).toBe('50')
  })

  it('passes AccountSchema.parse', () => {
    expect(() => AccountSchema.parse(transformAccount(makeRaw()))).not.toThrow()
  })
})
