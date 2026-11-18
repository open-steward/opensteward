import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type CloudMeAccount } from '../../../../../../../src/verticals/accounting/adapters/cloudme/transform/account'

function makeRaw(overrides: Partial<CloudMeAccount> = {}): CloudMeAccount {
  return {
    id: 'ACC-001',
    account_code: '4000',
    account_name: 'Revenue from Services',
    account_type: 'Income',
    active: true,
    ...overrides,
  }
}

describe('transformAccount (cloudme)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('ACC-001')
    expect(result.name).toBe('Revenue from Services')
    expect(result.customerDefinedCode).toBe('4000')
    expect(result.group).toBe('Income')
  })

  it('maps active status to ACTIVE', () => {
    const result = transformAccount(makeRaw({ active: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive status to ARCHIVED', () => {
    const result = transformAccount(makeRaw({ active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits name when account_name is empty', () => {
    const result = transformAccount(makeRaw({ account_name: '' }))
    expect(result.name).toBeUndefined()
  })

  it('omits customerDefinedCode when account_code is empty', () => {
    const result = transformAccount(makeRaw({ account_code: '' }))
    expect(result.customerDefinedCode).toBeUndefined()
  })

  it('omits group when account_type is empty', () => {
    const result = transformAccount(makeRaw({ account_type: '' }))
    expect(result.group).toBeUndefined()
  })

  it('handles numeric id correctly', () => {
    const result = transformAccount(makeRaw({ id: 123 }))
    expect(result.id).toBe('123')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
