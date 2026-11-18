import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type PleoAccount,
} from '../../../../../../../src/verticals/accounting/adapters/pleo/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<PleoAccount> = {}): PleoAccount {
  return {
    id: 'pleo-acct-1',
    name: 'Operating Expenses',
    accountNumber: '6000',
    accountCategoryId: 'cat-expense',
    hidden: false,
    ...overrides,
  }
}

describe('pleo transformAccount', () => {
  it('maps id', () => {
    expect(transformAccount(makeRaw()).id).toBe('pleo-acct-1')
  })

  it('maps name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Operating Expenses')
  })

  it('maps accountNumber to customerDefinedCode', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('6000')
  })

  it('sets type to OTHER (Pleo has no explicit type)', () => {
    expect(transformAccount(makeRaw()).type).toBe('OTHER')
  })

  it('maps hidden=false to ACTIVE', () => {
    expect(transformAccount(makeRaw({ hidden: false })).status).toBe('ACTIVE')
  })

  it('maps hidden=true to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ hidden: true })).status).toBe('ARCHIVED')
  })

  it('maps hidden=undefined to ACTIVE', () => {
    expect(transformAccount(makeRaw({ hidden: undefined })).status).toBe('ACTIVE')
  })

  it('passes AccountSchema.parse', () => {
    expect(() => AccountSchema.parse(transformAccount(makeRaw()))).not.toThrow()
  })
})
