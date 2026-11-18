import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type TymsAccount,
} from '../../../../../../../src/verticals/accounting/adapters/tyms/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<TymsAccount> = {}): TymsAccount {
  return {
    uuid: 'acc-001',
    name: 'Cash',
    code: '1000',
    type: 'Asset',
    is_active: true,
    balance: 5000,
    currency: 'USD',
    created_at: '2024-01-10T00:00:00.000Z',
    updated_at: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-001')
    expect(result.name).toBe('Cash')
    expect(result.customerDefinedCode).toBe('1000')
    expect(result.balance).toBe(5000)
    expect(result.status).toBe('ACTIVE')
    expect(result.type).toBe('ASSET')
  })

  it('passes raw as metadata', () => {
    const raw = makeAccount({ code: 'X99' })
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps is_active false to ARCHIVED', () => {
    const result = transformAccount(makeAccount({ is_active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('falls back to active flag when is_active is absent', () => {
    const raw = makeAccount({ is_active: undefined, active: false })
    const result = transformAccount(raw)
    expect(result.status).toBe('ARCHIVED')
  })

  it('defaults to ACTIVE when neither is_active nor active is present', () => {
    const raw = makeAccount({ is_active: undefined, active: undefined })
    const result = transformAccount(raw)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Revenue type to INCOME', () => {
    const result = transformAccount(makeAccount({ type: 'Revenue' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps unknown type to OTHER', () => {
    const result = transformAccount(makeAccount({ type: 'SomethingElse' }))
    expect(result.type).toBe('OTHER')
  })

  it('parses dates as Date objects', () => {
    const result = transformAccount(makeAccount())
    expect(result.createdAt).toEqual(new Date('2024-01-10T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('produces a schema-valid result', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
