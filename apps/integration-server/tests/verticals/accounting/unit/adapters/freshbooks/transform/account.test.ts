import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type FreshBooksAccount,
} from '../../../../../../../src/verticals/accounting/adapters/freshbooks/transform/account'

function makeAccount(overrides: Partial<FreshBooksAccount> = {}): FreshBooksAccount {
  return {
    id: 101,
    name: 'Cash Account',
    account_number: 'ACC-001',
    type: 'asset',
    sub_type: 'bank',
    active: true,
    balance: { amount: '5000.00', code: 'USD' },
    currency_code: 'USD',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id correctly (number to string)', () => {
    expect(transformAccount(makeAccount()).id).toBe('101')
  })

  it('maps name correctly', () => {
    expect(transformAccount(makeAccount()).name).toBe('Cash Account')
  })

  it('maps account_number to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('ACC-001')
  })

  it('maps currency_code to currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('USD')
  })

  it('parses balance amount as float', () => {
    expect(transformAccount(makeAccount()).balance).toBe(5000)
  })

  it('maps active true to status ACTIVE', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps active false to status ARCHIVED', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps type asset to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps type liability to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps type equity to EQUITY', () => {
    expect(transformAccount(makeAccount({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps type revenue to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'revenue' })).type).toBe('INCOME')
  })

  it('maps type expense to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'unknown' })).type).toBe('OTHER')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
