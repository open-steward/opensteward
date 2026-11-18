import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type FikenAccount,
} from '../../../../../../../src/verticals/accounting/adapters/fiken/transform/account'

function makeAccount(overrides: Partial<FikenAccount> = {}): FikenAccount {
  return {
    code: '3000',
    name: 'Sales Revenue',
    type: 'income',
    active: true,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps code to id', () => {
    expect(transformAccount(makeAccount()).id).toBe('3000')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('3000')
  })

  it('maps active=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps active=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps type containing "income" to INCOME type', () => {
    expect(transformAccount(makeAccount({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps type containing "revenue" to INCOME type', () => {
    expect(transformAccount(makeAccount({ type: 'revenue' })).type).toBe('INCOME')
  })

  it('maps type containing "asset" to ASSET type', () => {
    expect(transformAccount(makeAccount({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps type containing "liabilit" to LIABILITY type', () => {
    expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps type containing "equity" to EQUITY type', () => {
    expect(transformAccount(makeAccount({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps type containing "expense" to EXPENSE type', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps type containing "cost" to EXPENSE type', () => {
    expect(transformAccount(makeAccount({ type: 'cost' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'other' })).type).toBe('OTHER')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
