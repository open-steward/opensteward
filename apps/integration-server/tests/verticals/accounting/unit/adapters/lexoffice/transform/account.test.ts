import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type LexofficeAccount,
} from '../../../../../../../src/verticals/accounting/adapters/lexoffice/transform/account'

function makeAccount(overrides: Partial<LexofficeAccount> = {}): LexofficeAccount {
  return {
    id: 'acc-uuid-001',
    name: 'Sales Revenue',
    number: '4000',
    type: 'revenue',
    description: 'Main sales account',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id correctly', () => {
    expect(transformAccount(makeAccount()).id).toBe('acc-uuid-001')
  })

  it('maps name correctly', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps number to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps description correctly', () => {
    expect(transformAccount(makeAccount()).description).toBe('Main sales account')
  })

  it('maps type revenue to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'revenue' })).type).toBe('INCOME')
  })

  it('maps type expenditure to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'expenditure' })).type).toBe('EXPENSE')
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
