import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type AFAccount,
} from '../../../../../../../src/verticals/accounting/adapters/access-financials/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAFAccount(overrides: Partial<AFAccount> = {}): AFAccount {
  return {
    details: {
      primaryKey: 1001,
      accountCode: 'INC001',
      accountName: 'Sales Income',
      accountType: 'I',
    },
    summaryData: {
      balance: 5000.5,
    },
    ...overrides,
  }
}

describe('transformAccount (access-financials)', () => {
  it('maps primaryKey as string id', () => {
    const result = transformAccount(makeAFAccount())
    expect(result.id).toBe('1001')
  })

  it('maps accountCode to customerDefinedCode and accountName to name', () => {
    const result = transformAccount(makeAFAccount())
    expect(result.customerDefinedCode).toBe('INC001')
    expect(result.name).toBe('Sales Income')
  })

  it('maps type "I" to INCOME', () => {
    expect(transformAccount(makeAFAccount()).type).toBe('INCOME')
  })

  it('maps type "A" to ASSET', () => {
    const result = transformAccount(
      makeAFAccount({
        details: { primaryKey: 1, accountCode: 'A', accountName: 'A', accountType: 'A' },
      }),
    )
    expect(result.type).toBe('ASSET')
  })

  it('maps type "L" to LIABILITY', () => {
    const result = transformAccount(
      makeAFAccount({
        details: { primaryKey: 1, accountCode: 'L', accountName: 'L', accountType: 'L' },
      }),
    )
    expect(result.type).toBe('LIABILITY')
  })

  it('maps type "C" to EQUITY', () => {
    const result = transformAccount(
      makeAFAccount({
        details: { primaryKey: 1, accountCode: 'C', accountName: 'C', accountType: 'C' },
      }),
    )
    expect(result.type).toBe('EQUITY')
  })

  it('maps type "E" to EXPENSE', () => {
    const result = transformAccount(
      makeAFAccount({
        details: { primaryKey: 1, accountCode: 'E', accountName: 'E', accountType: 'E' },
      }),
    )
    expect(result.type).toBe('EXPENSE')
  })

  it('maps unknown accountType to OTHER', () => {
    const result = transformAccount(
      makeAFAccount({
        details: { primaryKey: 1, accountCode: 'X', accountName: 'X', accountType: 'X' },
      }),
    )
    expect(result.type).toBe('OTHER')
  })

  it('status is always ACTIVE', () => {
    expect(transformAccount(makeAFAccount()).status).toBe('ACTIVE')
  })

  it('converts balance to integer minor units', () => {
    const result = transformAccount(makeAFAccount({ summaryData: { balance: 5000.5 } }))
    expect(result.balance).toBe(500050)
  })

  it('leaves balance undefined when summaryData is absent', () => {
    const result = transformAccount(makeAFAccount({ summaryData: undefined }))
    expect(result.balance).toBeUndefined()
  })

  it('passes AccountSchema.parse with balance converted to minor units', () => {
    const result = transformAccount(makeAFAccount({ summaryData: { balance: 5000.5 } }))
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })

  it('passes AccountSchema.parse when balance is a whole number', () => {
    const result = transformAccount(makeAFAccount({ summaryData: { balance: 5000 } }))
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
