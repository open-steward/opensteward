import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type BuiltAfricaAccount,
} from '../../../../../../../src/verticals/accounting/adapters/built-africa/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<BuiltAfricaAccount> = {}): BuiltAfricaAccount {
  return {
    id: 42,
    account_name: 'Sales Revenue',
    description: 'Main revenue account',
    code: '4000',
    type_id: 4,
    currency: 'USD',
    archived: false,
    live_balance: 1250.0,
    created_at: '2024-01-15T09:30:00Z',
    updated_at: '2024-02-01T14:20:00Z',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id to string', () => {
    expect(transformAccount(makeAccount()).id).toBe('42')
  })

  it('maps account_name to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps description', () => {
    expect(transformAccount(makeAccount()).description).toBe('Main revenue account')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('USD')
  })

  it('maps type_id 1 to ASSET', () => {
    expect(transformAccount(makeAccount({ type_id: 1 })).type).toBe('ASSET')
  })

  it('maps type_id 2 to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type_id: 2 })).type).toBe('LIABILITY')
  })

  it('maps type_id 3 to EQUITY', () => {
    expect(transformAccount(makeAccount({ type_id: 3 })).type).toBe('EQUITY')
  })

  it('maps type_id 4 to INCOME', () => {
    expect(transformAccount(makeAccount({ type_id: 4 })).type).toBe('INCOME')
  })

  it('maps type_id 5 to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type_id: 5 })).type).toBe('EXPENSE')
  })

  it('maps unknown type_id to undefined', () => {
    expect(transformAccount(makeAccount({ type_id: 99 })).type).toBeUndefined()
  })

  it('maps archived=false to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ archived: false })).status).toBe('ACTIVE')
  })

  it('maps archived=true to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ archived: true })).status).toBe('ARCHIVED')
  })

  it('maps live_balance to balance in minor units', () => {
    expect(transformAccount(makeAccount({ live_balance: 12.5 })).balance).toBe(1250)
  })

  it('maps live_balance=0 to 0 minor units', () => {
    expect(transformAccount(makeAccount({ live_balance: 0 })).balance).toBe(0)
  })

  it('maps created_at to createdAt as Date', () => {
    expect(transformAccount(makeAccount()).createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updated_at to updatedAt as Date', () => {
    expect(transformAccount(makeAccount()).updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('returns undefined createdAt when created_at is absent', () => {
    expect(transformAccount(makeAccount({ created_at: undefined })).createdAt).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeAccount()))).not.toThrow()
  })
})
