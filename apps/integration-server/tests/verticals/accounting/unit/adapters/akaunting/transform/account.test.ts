import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type AkauntingAccount,
} from '../../../../../../../src/verticals/accounting/adapters/akaunting/transform/account'

function makeAccount(overrides: Partial<AkauntingAccount> = {}): AkauntingAccount {
  return {
    id: 301,
    name: 'Sales Revenue',
    number: '4000',
    type_id: 13,
    currency_code: 'EUR',
    opening_balance: 0,
    bank_name: '',
    bank_phone: '',
    enabled: true,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id from raw id as string', () => {
    expect(transformAccount(makeAccount()).id).toBe('301')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps number to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps currency_code to currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('EUR')
  })

  it('maps enabled=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ enabled: true })).status).toBe('ACTIVE')
  })

  it('maps enabled=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ enabled: false })).status).toBe('ARCHIVED')
  })

  it('maps type_id 1-5 to ASSET', () => {
    expect(transformAccount(makeAccount({ type_id: 1 })).type).toBe('ASSET')
    expect(transformAccount(makeAccount({ type_id: 3 })).type).toBe('ASSET')
    expect(transformAccount(makeAccount({ type_id: 5 })).type).toBe('ASSET')
  })

  it('maps type_id 6-8 to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type_id: 6 })).type).toBe('LIABILITY')
    expect(transformAccount(makeAccount({ type_id: 7 })).type).toBe('LIABILITY')
    expect(transformAccount(makeAccount({ type_id: 8 })).type).toBe('LIABILITY')
  })

  it('maps type_id 9 to EQUITY', () => {
    expect(transformAccount(makeAccount({ type_id: 9 })).type).toBe('EQUITY')
  })

  it('maps type_id 10-12 to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type_id: 10 })).type).toBe('EXPENSE')
    expect(transformAccount(makeAccount({ type_id: 11 })).type).toBe('EXPENSE')
    expect(transformAccount(makeAccount({ type_id: 12 })).type).toBe('EXPENSE')
  })

  it('maps type_id 13-15 to INCOME', () => {
    expect(transformAccount(makeAccount({ type_id: 13 })).type).toBe('INCOME')
    expect(transformAccount(makeAccount({ type_id: 14 })).type).toBe('INCOME')
    expect(transformAccount(makeAccount({ type_id: 15 })).type).toBe('INCOME')
  })

  it('maps unknown type_id to OTHER', () => {
    expect(transformAccount(makeAccount({ type_id: 99 })).type).toBe('OTHER')
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
