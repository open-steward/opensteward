import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type HorizonErpAccount } from '../../../../../../../src/verticals/accounting/adapters/horizonerp/transform/account'

function makeRaw(overrides: Partial<HorizonErpAccount> = {}): HorizonErpAccount {
  return {
    id: 'ACC-001',
    code: '4000',
    name: 'Sales Revenue',
    group: 'Sales',
    active: true,
    ...overrides,
  }
}

describe('transformAccount (horizonerp)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('ACC-001')
    expect(result.name).toBe('Sales Revenue')
    expect(result.customerDefinedCode).toBe('4000')
    expect(result.group).toBe('Sales')
  })

  it('maps active status to ACTIVE', () => {
    const result = transformAccount(makeRaw({ active: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive status to ARCHIVED', () => {
    const result = transformAccount(makeRaw({ active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps Sales group to INCOME type', () => {
    const result = transformAccount(makeRaw({ group: 'Sales' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps Purchase group to EXPENSE type', () => {
    const result = transformAccount(makeRaw({ group: 'Purchase' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps Expense group to EXPENSE type', () => {
    const result = transformAccount(makeRaw({ group: 'Expense' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps Asset group to ASSET type', () => {
    const result = transformAccount(makeRaw({ group: 'Asset' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps Liability group to LIABILITY type', () => {
    const result = transformAccount(makeRaw({ group: 'Liability' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps Capital group to EQUITY type', () => {
    const result = transformAccount(makeRaw({ group: 'Capital' }))
    expect(result.type).toBe('EQUITY')
  })

  it('defaults unknown group to OTHER type', () => {
    const result = transformAccount(makeRaw({ group: 'Unknown' }))
    expect(result.type).toBe('OTHER')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits name when name is empty', () => {
    const result = transformAccount(makeRaw({ name: '' }))
    expect(result.name).toBeUndefined()
  })

  it('omits customerDefinedCode when code is empty', () => {
    const result = transformAccount(makeRaw({ code: '' }))
    expect(result.customerDefinedCode).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
