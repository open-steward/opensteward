import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type TripletexAccount,
} from '../../../../../../../src/verticals/accounting/adapters/tripletex/transform/account'

function makeAccount(overrides: Partial<TripletexAccount> = {}): TripletexAccount {
  return {
    id: 101,
    number: 1500,
    name: 'Accounts Receivable',
    description: 'AR ledger',
    isInactive: false,
    isBankAccount: false,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id as string', () => {
    expect(transformAccount(makeAccount()).id).toBe('101')
  })

  it('maps name correctly', () => {
    expect(transformAccount(makeAccount()).name).toBe('Accounts Receivable')
  })

  it('maps description correctly', () => {
    expect(transformAccount(makeAccount()).description).toBe('AR ledger')
  })

  it('maps number to customerDefinedCode as string', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('1500')
  })

  it('maps isBankAccount true to ASSET type', () => {
    expect(transformAccount(makeAccount({ isBankAccount: true })).type).toBe('ASSET')
  })

  it('maps isBankAccount false to OTHER type', () => {
    expect(transformAccount(makeAccount({ isBankAccount: false })).type).toBe('OTHER')
  })

  it('maps isInactive false to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ isInactive: false })).status).toBe('ACTIVE')
  })

  it('maps isInactive true to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ isInactive: true })).status).toBe('ARCHIVED')
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
