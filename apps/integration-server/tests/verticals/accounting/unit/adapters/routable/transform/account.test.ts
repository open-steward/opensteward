import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type RoutableAccount,
} from '../../../../../../../src/verticals/accounting/adapters/routable/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<RoutableAccount> = {}): RoutableAccount {
  return {
    id: 'acct_abc123',
    name: 'Operating Checking',
    type: 'bank',
    status: 'active',
    currency: 'USD',
    type_details: {
      available_amount: '1250.00',
    },
    created_at: '2024-01-15T09:30:00Z',
    updated_at: '2024-06-01T14:00:00Z',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('acct_abc123')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Operating Checking')
  })

  it('always maps type to ASSET regardless of platform type value', () => {
    expect(transformAccount(makeAccount({ type: 'bank' })).type).toBe('ASSET')
    expect(transformAccount(makeAccount({ type: 'balance' })).type).toBe('ASSET')
    expect(transformAccount(makeAccount({ type: undefined })).type).toBe('ASSET')
  })

  it('maps active status to ACTIVE', () => {
    expect(transformAccount(makeAccount({ status: 'active' })).status).toBe('ACTIVE')
  })

  it('maps archived status to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ status: 'archived' })).status).toBe('ARCHIVED')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformAccount(makeAccount({ status: 'unknown_status' })).status).toBe('ACTIVE')
  })

  it('maps currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('USD')
  })

  it('converts string available_amount to minor units (× 100)', () => {
    expect(transformAccount(makeAccount()).balance).toBe(125000)
  })

  it('converts numeric available_amount to minor units (× 100)', () => {
    const result = transformAccount(
      makeAccount({
        type_details: { available_amount: 99.99 },
      }),
    )
    expect(result.balance).toBe(9999)
  })

  it('returns undefined balance when available_amount is absent', () => {
    const result = transformAccount(makeAccount({ type_details: undefined }))
    expect(result.balance).toBeUndefined()
  })

  it('maps created_at and updated_at to Date objects', () => {
    const result = transformAccount(makeAccount())
    expect(result.createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
    expect(result.updatedAt).toEqual(new Date('2024-06-01T14:00:00Z'))
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('passes AccountSchema.parse without throwing', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
