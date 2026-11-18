import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type FreeAgentAccount,
} from '../../../../../../../src/verticals/accounting/adapters/freeagent/transform/account'

function makeAccount(overrides: Partial<FreeAgentAccount> = {}): FreeAgentAccount {
  return {
    url: 'https://api.freeagent.com/v2/ledger_accounts/1234',
    name: 'Sales Revenue',
    description: 'Revenue from sales',
    type: 'Income',
    status: 'Active',
    nominal_code: '4000',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('extracts id from url', () => {
    expect(transformAccount(makeAccount()).id).toBe('1234')
  })

  it('maps name correctly', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps description correctly', () => {
    expect(transformAccount(makeAccount()).description).toBe('Revenue from sales')
  })

  it('maps nominal_code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps Income type to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'Income' })).type).toBe('INCOME')
  })

  it('maps Sales type to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'Sales' })).type).toBe('INCOME')
  })

  it('maps CurrentAsset type to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'CurrentAsset' })).type).toBe('ASSET')
  })

  it('maps FixedAsset type to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'FixedAsset' })).type).toBe('ASSET')
  })

  it('maps CurrentLiability type to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'CurrentLiability' })).type).toBe('LIABILITY')
  })

  it('maps Equity type to EQUITY', () => {
    expect(transformAccount(makeAccount({ type: 'Equity' })).type).toBe('EQUITY')
  })

  it('maps Expense type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'Expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'Unknown' })).type).toBe('OTHER')
  })

  it('maps Active status to ACTIVE', () => {
    expect(transformAccount(makeAccount({ status: 'Active' })).status).toBe('ACTIVE')
  })

  it('maps Inactive status to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ status: 'Inactive' })).status).toBe('ARCHIVED')
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
