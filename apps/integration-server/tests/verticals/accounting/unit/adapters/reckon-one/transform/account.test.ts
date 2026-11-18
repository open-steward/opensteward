import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type ReckonOneAccount,
} from '../../../../../../../src/verticals/accounting/adapters/reckon-one/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<ReckonOneAccount> = {}): ReckonOneAccount {
  return {
    id: 'acct_001',
    name: 'Trade Debtors',
    displayId: '1200',
    description: 'Accounts receivable',
    type: 'ACCOUNTSRECEIVABLE',
    isActive: true,
    currentBalance: 5000.75,
    currency: 'AUD',
    createdDateTime: '2022-06-01T10:00:00Z',
    modifiedDateTime: '2024-01-15T09:30:00Z',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('acct_001')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Trade Debtors')
  })

  it('maps displayId to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('1200')
  })

  it('maps description', () => {
    expect(transformAccount(makeAccount()).description).toBe('Accounts receivable')
  })

  it('maps ACCOUNTSRECEIVABLE type to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'ACCOUNTSRECEIVABLE' })).type).toBe('ASSET')
  })

  it('maps BANK type to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'BANK' })).type).toBe('ASSET')
  })

  it('maps CURRENTLIABILITY type to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'CURRENTLIABILITY' })).type).toBe('LIABILITY')
  })

  it('maps EQUITY type to EQUITY', () => {
    expect(transformAccount(makeAccount({ type: 'EQUITY' })).type).toBe('EQUITY')
  })

  it('maps REVENUE type to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'REVENUE' })).type).toBe('INCOME')
  })

  it('maps EXPENSE type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'EXPENSE' })).type).toBe('EXPENSE')
  })

  it('maps COSTOFGOODSSOLD to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'COSTOFGOODSSOLD' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'MYSTERY' })).type).toBe('OTHER')
  })

  it('maps isActive=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ isActive: true })).status).toBe('ACTIVE')
  })

  it('maps isActive=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ isActive: false })).status).toBe('ARCHIVED')
  })

  it('converts currentBalance decimal to minor units', () => {
    expect(transformAccount(makeAccount({ currentBalance: 5000.75 })).balance).toBe(500075)
  })

  it('maps currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('AUD')
  })

  it('maps createdDateTime to createdAt as Date', () => {
    expect(transformAccount(makeAccount()).createdAt).toEqual(new Date('2022-06-01T10:00:00Z'))
  })

  it('maps modifiedDateTime to updatedAt as Date', () => {
    expect(transformAccount(makeAccount()).updatedAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces output that passes AccountSchema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeAccount()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformAccount({ id: 'acct_001' })
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
