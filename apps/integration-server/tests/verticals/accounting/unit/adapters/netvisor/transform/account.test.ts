import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type NetvisorAccount,
} from '../../../../../../../src/verticals/accounting/adapters/netvisor/transform/account'

function makeAccount(overrides: Partial<NetvisorAccount> = {}): NetvisorAccount {
  return {
    NetvisorKey: 44001,
    Number: 3000,
    Name: 'Myyntituotot',
    AccountType: 'Revenue',
    IsActive: 1,
    Currency: 'EUR',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps NetvisorKey to id as string', () => {
    expect(transformAccount(makeAccount()).id).toBe('44001')
  })

  it('maps Name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Myyntituotot')
  })

  it('maps Number to customerDefinedCode as string', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('3000')
  })

  it('maps Currency to currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('EUR')
  })

  it('maps IsActive=1 to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ IsActive: 1 })).status).toBe('ACTIVE')
  })

  it('maps IsActive=0 to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ IsActive: 0 })).status).toBe('ARCHIVED')
  })

  it('maps AccountType Revenue to INCOME', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Revenue' })).type).toBe('INCOME')
  })

  it('maps AccountType Cost to EXPENSE', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Cost' })).type).toBe('EXPENSE')
  })

  it('maps AccountType Asset to ASSET', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Asset' })).type).toBe('ASSET')
  })

  it('maps AccountType Liability to LIABILITY', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Liability' })).type).toBe('LIABILITY')
  })

  it('maps AccountType Equity to EQUITY', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Equity' })).type).toBe('EQUITY')
  })

  it('maps unknown AccountType to OTHER', () => {
    expect(transformAccount(makeAccount({ AccountType: 'Unknown' })).type).toBe('OTHER')
  })

  it('returns undefined name when Name is empty', () => {
    expect(transformAccount(makeAccount({ Name: '' })).name).toBeUndefined()
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
