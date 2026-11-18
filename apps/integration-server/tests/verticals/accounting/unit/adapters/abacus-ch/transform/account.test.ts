import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type AbacusAccount,
} from '../../../../../../../src/verticals/accounting/adapters/abacus-ch/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAbacusAccount(overrides: Partial<AbacusAccount> = {}): AbacusAccount {
  return {
    Id: '1001',
    AccountNumber: '1000',
    Name: 'Bank Account',
    Description: 'Main operating bank account',
    AccountType: 'Bank',
    IsActive: true,
    Balance: 125.5,
    CurrencyCode: 'CHF',
    ParentId: '500',
    CreatedAt: '2024-01-10T08:00:00.000Z',
    ModifiedAt: '2024-06-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformAccount (abacus-ch)', () => {
  it('maps id as string from numeric or string Id', () => {
    expect(transformAccount(makeAbacusAccount({ Id: '42' })).id).toBe('42')
    expect(transformAccount(makeAbacusAccount({ Id: 99 })).id).toBe('99')
  })

  it('maps AccountNumber to customerDefinedCode', () => {
    const result = transformAccount(makeAbacusAccount({ AccountNumber: '1000' }))
    expect(result.customerDefinedCode).toBe('1000')
  })

  it('maps Name and Description', () => {
    const result = transformAccount(makeAbacusAccount())
    expect(result.name).toBe('Bank Account')
    expect(result.description).toBe('Main operating bank account')
  })

  it('maps Bank AccountType to ASSET', () => {
    expect(transformAccount(makeAbacusAccount({ AccountType: 'Bank' })).type).toBe('ASSET')
  })

  it('maps German Aktivkonto to ASSET', () => {
    expect(transformAccount(makeAbacusAccount({ AccountType: 'Aktivkonto' })).type).toBe('ASSET')
  })

  it('maps Passivkonto to LIABILITY', () => {
    expect(transformAccount(makeAbacusAccount({ AccountType: 'Passivkonto' })).type).toBe(
      'LIABILITY',
    )
  })

  it('maps Eigenkapital to EQUITY', () => {
    expect(transformAccount(makeAbacusAccount({ AccountType: 'Eigenkapital' })).type).toBe('EQUITY')
  })

  it('maps Aufwand to EXPENSE', () => {
    expect(transformAccount(makeAbacusAccount({ AccountType: 'Aufwand' })).type).toBe('EXPENSE')
  })

  it('maps Ertrag to INCOME', () => {
    expect(transformAccount(makeAbacusAccount({ AccountType: 'Ertrag' })).type).toBe('INCOME')
  })

  it('maps unknown AccountType to OTHER', () => {
    expect(transformAccount(makeAbacusAccount({ AccountType: 'Unknown' })).type).toBe('OTHER')
  })

  it('status is ACTIVE when IsActive is undefined (truthy default)', () => {
    const result = transformAccount(makeAbacusAccount({ IsActive: undefined }))
    expect(result.status).toBe('ACTIVE')
  })

  it('status is ARCHIVED only when IsActive is explicitly false', () => {
    expect(transformAccount(makeAbacusAccount({ IsActive: false })).status).toBe('ARCHIVED')
    expect(transformAccount(makeAbacusAccount({ IsActive: true })).status).toBe('ACTIVE')
  })

  it('converts Balance to minor units via Math.round(x * 100)', () => {
    const result = transformAccount(makeAbacusAccount({ Balance: 125.5 }))
    expect(result.balance).toBe(12550)
  })

  it('leaves balance undefined when Balance is absent', () => {
    const result = transformAccount(makeAbacusAccount({ Balance: undefined }))
    expect(result.balance).toBeUndefined()
  })

  it('maps ParentId as string', () => {
    const result = transformAccount(makeAbacusAccount({ ParentId: 500 }))
    expect(result.parentId).toBe('500')
  })

  it('maps CreatedAt and ModifiedAt as Date', () => {
    const result = transformAccount(makeAbacusAccount())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes AccountSchema.parse without throwing', () => {
    const result = transformAccount(makeAbacusAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
