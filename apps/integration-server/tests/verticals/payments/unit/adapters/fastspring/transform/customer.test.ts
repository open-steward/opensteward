import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawFastspringAccount,
} from '../../../../../../../src/verticals/payments/adapters/fastspring/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('fastspring transformCustomer', () => {
  it('maps a full account record', () => {
    const raw: RawFastspringAccount = {
      id: 'ACCT-001',
      account: 'ACCT-001',
      contact: {
        first: 'Jane',
        last: 'Doe',
        email: 'jane.doe@example.com',
        company: 'Acme Corp',
        phone: '+14155550123',
      },
      language: 'en',
      country: 'US',
      lookup: { global: 'GLOBAL-001', custom: 'CUSTOM-001' },
      url: 'https://fastspring.com/account/ACCT-001',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('ACCT-001')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.phone).toBe('+14155550123')
    expect(result.gateway).toBe('fastspring')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal account with no contact', () => {
    const raw: RawFastspringAccount = {
      id: 'ACCT-002',
      contact: null,
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('ACCT-002')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to account field when id is absent', () => {
    const raw: RawFastspringAccount = {
      account: 'ACCT-FALLBACK',
      contact: {
        first: 'Bob',
        last: 'Builder',
        email: 'bob@example.com',
      },
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('ACCT-FALLBACK')
    expect(result.name).toBe('Bob Builder')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
