import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type VismaAccount } from '../../../../../../../src/verticals/accounting/adapters/visma/transform/account'

function makeAccount(overrides: Partial<VismaAccount> = {}): VismaAccount {
  return {
    Number: '1910',
    Name: 'Kassa',
    IsActive: true,
    FiscalYearId: 'fy-uuid-1234',
    Type: 1,
    TypeDescription: 'Asset',
    VatCodeId: '',
    ModifiedUtc: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps account number as id', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('1910')
    expect(result.customerDefinedCode).toBe('1910')
  })

  it('maps name', () => {
    const result = transformAccount(makeAccount())
    expect(result.name).toBe('Kassa')
  })

  it('maps active status to ACTIVE', () => {
    const result = transformAccount(makeAccount({ IsActive: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive status to ARCHIVED', () => {
    const result = transformAccount(makeAccount({ IsActive: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps account type integers correctly', () => {
    expect(transformAccount(makeAccount({ Type: 1 })).type).toBe('ASSET')
    expect(transformAccount(makeAccount({ Type: 2 })).type).toBe('LIABILITY')
    expect(transformAccount(makeAccount({ Type: 3 })).type).toBe('EQUITY')
    expect(transformAccount(makeAccount({ Type: 4 })).type).toBe('INCOME')
    expect(transformAccount(makeAccount({ Type: 5 })).type).toBe('EXPENSE')
    expect(transformAccount(makeAccount({ Type: 99 })).type).toBe('OTHER')
  })

  it('passes raw object through as metadata', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
