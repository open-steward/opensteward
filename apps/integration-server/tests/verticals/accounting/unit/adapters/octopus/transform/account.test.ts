import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type OctopusAccount,
} from '../../../../../../../src/verticals/accounting/adapters/octopus/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<OctopusAccount> = {}): OctopusAccount {
  return {
    accountId: 400000,
    accountNumber: '400000',
    description: 'Customers Receivable',
    shortDescription: 'AR',
    active: true,
    balance: 250000,
    accountType: 'ASSET',
    ...overrides,
  }
}

describe('transformAccount (octopus)', () => {
  it('maps accountId to id (string)', () => {
    expect(transformAccount(makeRaw()).id).toBe('400000')
  })

  it('maps accountNumber to customerDefinedCode', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('400000')
  })

  it('maps description to name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Customers Receivable')
  })

  it('maps ASSET accountType', () => {
    expect(transformAccount(makeRaw({ accountType: 'ASSET' })).type).toBe('ASSET')
  })

  it('maps EXPENSE accountType via keyword EXPENSE', () => {
    expect(transformAccount(makeRaw({ accountType: 'EXPENSE' })).type).toBe('EXPENSE')
  })

  it('maps INCOME via OPBRENGST (Dutch)', () => {
    expect(transformAccount(makeRaw({ accountType: 'OPBRENGST' })).type).toBe('INCOME')
  })

  it('maps unknown accountType to OTHER', () => {
    expect(transformAccount(makeRaw({ accountType: 'UNKNOWN' })).type).toBe('OTHER')
  })

  it('maps active=true to ACTIVE status', () => {
    expect(transformAccount(makeRaw({ active: true })).status).toBe('ACTIVE')
  })

  it('maps active=false to ARCHIVED status', () => {
    expect(transformAccount(makeRaw({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps balance', () => {
    expect(transformAccount(makeRaw()).balance).toBe(250000)
  })

  it('passes AccountSchema.parse without throwing', () => {
    expect(() => AccountSchema.parse(transformAccount(makeRaw()))).not.toThrow()
  })
})
