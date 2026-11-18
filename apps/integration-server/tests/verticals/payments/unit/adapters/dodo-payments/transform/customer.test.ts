import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawDodoCustomer,
} from '../../../../../../../src/verticals/payments/adapters/dodo-payments/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('dodo-payments transformCustomer', () => {
  it('maps all fields from a full customer record', () => {
    const raw: RawDodoCustomer = {
      customer_id: 'cus_abc',
      business_id: 'biz_001',
      name: 'Alice Smith',
      email: 'alice@example.com',
      phone_number: '+14155550123',
      created_at: '2024-03-01T00:00:00Z',
      metadata: { plan: 'pro', region: 'us-east' },
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_abc')
    expect(result.externalId).toBe('cus_abc')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Smith')
    expect(result.phone).toBe('+14155550123')
    expect(result.gateway).toBe('dodo-payments')
    expect(result.metadata).toMatchObject({ plan: 'pro', region: 'us-east' })
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const raw: RawDodoCustomer = {
      customer_id: 'cus_min',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_min')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips name, email, phone, metadata through untransformCustomer', () => {
    const raw: RawDodoCustomer = {
      customer_id: 'cus_rt',
      name: 'Bob Jones',
      email: 'bob@example.com',
      phone_number: '+447700900123',
      created_at: '2024-03-01T00:00:00Z',
      metadata: { tier: 'gold' },
    }
    const canonical = transformCustomer(raw)
    const body = untransformCustomer(canonical)
    expect(body.name).toBe('Bob Jones')
    expect(body.email).toBe('bob@example.com')
    expect(body.phone_number).toBe('+447700900123')
  })
})
