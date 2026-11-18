import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type TallyAccount,
} from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/account'

function makeAccount(overrides: Partial<TallyAccount> = {}): TallyAccount {
  return {
    NAME: 'Bank of India',
    PARENT: 'Bank Accounts',
    OPENINGBALANCE: '10000.00',
    ISCOSTCENTRESACTIVATED: 'No',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps NAME to id', () => {
    expect(transformAccount(makeAccount()).id).toBe('Bank of India')
  })

  it('maps NAME to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Bank of India')
  })

  it('maps NAME to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('Bank of India')
  })

  it('always sets status to ACTIVE', () => {
    expect(transformAccount(makeAccount()).status).toBe('ACTIVE')
  })

  it('parses OPENINGBALANCE as balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(10000)
  })

  it('maps PARENT containing assets to ASSET type', () => {
    expect(transformAccount(makeAccount({ PARENT: 'Current Assets' })).type).toBe('ASSET')
  })

  it('maps PARENT containing liabilities to LIABILITY type', () => {
    expect(transformAccount(makeAccount({ PARENT: 'Current Liabilities' })).type).toBe('LIABILITY')
  })

  it('maps PARENT containing income to INCOME type', () => {
    expect(transformAccount(makeAccount({ PARENT: 'Income from Operations' })).type).toBe('INCOME')
  })

  it('maps PARENT containing expense to EXPENSE type', () => {
    expect(transformAccount(makeAccount({ PARENT: 'Indirect Expenses' })).type).toBe('EXPENSE')
  })

  it('maps PARENT containing capital to EQUITY type', () => {
    expect(transformAccount(makeAccount({ PARENT: 'Capital Account' })).type).toBe('EQUITY')
  })

  it('maps unknown PARENT to OTHER type', () => {
    expect(transformAccount(makeAccount({ PARENT: 'Suspense' })).type).toBe('OTHER')
  })

  it('sets balance to undefined when OPENINGBALANCE is not a number', () => {
    expect(transformAccount(makeAccount({ OPENINGBALANCE: 'N/A' })).balance).toBeUndefined()
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
