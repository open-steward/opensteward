import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type BusyAccount } from '../../../../../../../src/verticals/accounting/adapters/busy/transform/account'

function makeRaw(overrides: Partial<BusyAccount> = {}): BusyAccount {
  return {
    AccCode: 'ACC-001',
    AccName: 'Sales Revenue',
    GroupName: 'Income',
    IsActive: true,
    ...overrides,
  }
}

describe('transformAccount (busy)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('ACC-001')
    expect(result.name).toBe('Sales Revenue')
    expect(result.customerDefinedCode).toBe('ACC-001')
    expect(result.group).toBe('Income')
  })

  it('maps active status to ACTIVE', () => {
    const result = transformAccount(makeRaw({ IsActive: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive status to ARCHIVED', () => {
    const result = transformAccount(makeRaw({ IsActive: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits name when AccName is empty', () => {
    const result = transformAccount(makeRaw({ AccName: '' }))
    expect(result.name).toBeUndefined()
  })

  it('omits group when GroupName is empty', () => {
    const result = transformAccount(makeRaw({ GroupName: '' }))
    expect(result.group).toBeUndefined()
  })

  it('uses AccCode as both id and customerDefinedCode', () => {
    const result = transformAccount(makeRaw({ AccCode: 'XYZ-999' }))
    expect(result.id).toBe('XYZ-999')
    expect(result.customerDefinedCode).toBe('XYZ-999')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
