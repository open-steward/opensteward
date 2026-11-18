import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type PromikBookAccount,
} from '../../../../../../../src/verticals/accounting/adapters/promikbook/transform/account'

function makeAccount(overrides: Partial<PromikBookAccount> = {}): PromikBookAccount {
  return {
    id: 10,
    account_no: '3000',
    name: 'Försäljning',
    type: 'income',
    active: true,
    ...overrides,
  }
}

describe('transformAccount (PromikBook)', () => {
  it('maps id and account_no to code', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('10')
    expect(result.customerDefinedCode).toBe('3000')
  })

  it('maps name field', () => {
    expect(transformAccount(makeAccount()).name).toBe('Försäljning')
  })

  it('maps active=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps active=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps income type to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps expense type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps asset type to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability type to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'misc' })).type).toBe('OTHER')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
