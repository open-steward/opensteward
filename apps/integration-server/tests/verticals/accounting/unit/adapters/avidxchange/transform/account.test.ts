import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type AvidXchangeGLAccount,
} from '../../../../../../../src/verticals/accounting/adapters/avidxchange/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<AvidXchangeGLAccount> = {}): AvidXchangeGLAccount {
  return {
    glAccountId: 'gl-001',
    glAccountCode: '4000',
    description: 'Sales Revenue',
    accountType: 'INCOME',
    isActive: true,
    parentId: 'gl-000',
    createdDate: '2024-01-01T00:00:00.000Z',
    modifiedDate: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformAccount (avidxchange)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('gl-001')
    expect(result.name).toBe('Sales Revenue')
    expect(result.description).toBe('Sales Revenue')
    expect(result.customerDefinedCode).toBe('4000')
    expect(result.parentId).toBe('gl-000')
  })

  it('maps isActive=true to ACTIVE', () => {
    const result = transformAccount(makeRaw({ isActive: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps isActive=false to ARCHIVED', () => {
    const result = transformAccount(makeRaw({ isActive: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps accountType INCOME correctly', () => {
    const result = transformAccount(makeRaw({ accountType: 'INCOME' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps accountType REVENUE to INCOME', () => {
    const result = transformAccount(makeRaw({ accountType: 'REVENUE' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps accountType EXPENSE correctly', () => {
    const result = transformAccount(makeRaw({ accountType: 'EXPENSE' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps accountType ASSET correctly', () => {
    const result = transformAccount(makeRaw({ accountType: 'ASSET' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps unknown accountType string to OTHER', () => {
    const result = transformAccount(makeRaw({ accountType: 'CUSTOM' }))
    expect(result.type).toBe('OTHER')
  })

  it('maps missing accountType to undefined', () => {
    const result = transformAccount(makeRaw({ accountType: undefined }))
    expect(result.type).toBeUndefined()
  })

  it('parses dates as Date objects', () => {
    const result = transformAccount(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes AccountSchema.parse without throwing', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
