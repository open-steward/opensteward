import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type PowerOfficeAccount,
} from '../../../../../../../src/verticals/accounting/adapters/poweroffice/transform/account'

function makeAccount(overrides: Partial<PowerOfficeAccount> = {}): PowerOfficeAccount {
  return {
    id: 1001,
    code: 'ACC-001',
    name: 'Cash Account',
    type: 1000,
    isActive: true,
    currencyCode: 'NOK',
    balance: 5000,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id correctly', () => {
    expect(transformAccount(makeAccount()).id).toBe('1001')
  })

  it('maps name correctly', () => {
    expect(transformAccount(makeAccount()).name).toBe('Cash Account')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('ACC-001')
  })

  it('maps currencyCode to currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('NOK')
  })

  it('maps balance correctly', () => {
    expect(transformAccount(makeAccount()).balance).toBe(5000)
  })

  it('maps isActive true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ isActive: true })).status).toBe('ACTIVE')
  })

  it('maps isActive false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ isActive: false })).status).toBe('ARCHIVED')
  })

  it('maps type 1000-1999 to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 1000 })).type).toBe('ASSET')
    expect(transformAccount(makeAccount({ type: 1500 })).type).toBe('ASSET')
    expect(transformAccount(makeAccount({ type: 1999 })).type).toBe('ASSET')
  })

  it('maps type 2000-2999 to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 2000 })).type).toBe('LIABILITY')
    expect(transformAccount(makeAccount({ type: 2500 })).type).toBe('LIABILITY')
  })

  it('maps type 3000-3999 to EQUITY', () => {
    expect(transformAccount(makeAccount({ type: 3000 })).type).toBe('EQUITY')
    expect(transformAccount(makeAccount({ type: 3500 })).type).toBe('EQUITY')
  })

  it('maps type 4000-4999 to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 4000 })).type).toBe('INCOME')
    expect(transformAccount(makeAccount({ type: 4999 })).type).toBe('INCOME')
  })

  it('maps type 5000+ to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 5000 })).type).toBe('EXPENSE')
    expect(transformAccount(makeAccount({ type: 8000 })).type).toBe('EXPENSE')
  })

  it('maps unrecognized type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 0 })).type).toBe('OTHER')
    expect(transformAccount(makeAccount({ type: 500 })).type).toBe('OTHER')
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
