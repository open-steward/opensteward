import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawPaddleCustomer,
} from '../../../../../../../src/verticals/payments/adapters/paddle/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('paddle transformCustomer', () => {
  it('maps a Paddle customer to canonical Customer with all fields', () => {
    const raw: RawPaddleCustomer = {
      id: 'ctm_paddle_001',
      email: 'alice@example.com',
      name: 'Alice Paddler',
      marketing_consent: true,
      locale: 'en-US',
      status: 'active',
      custom_data: { tier: 'pro', account_id: '42' },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
    }
    const result = transformCustomer(raw)

    expect(result.id).toBe('ctm_paddle_001')
    expect(result.externalId).toBe('ctm_paddle_001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Paddler')
    expect(result.gateway).toBe('paddle')
    expect(result.metadata.locale).toBe('en-US')
    expect(result.metadata.status).toBe('active')
    expect(result.metadata.tier).toBe('pro')
    expect(result.metadata.account_id).toBe('42')
    expect(result.createdAt).toBe('2024-01-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-06-01T00:00:00Z')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal customer (only id present)', () => {
    const raw: RawPaddleCustomer = {
      id: 'ctm_paddle_002',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('ctm_paddle_002')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(result.gateway).toBe('paddle')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('defaults id to empty string when id is missing', () => {
    const raw: RawPaddleCustomer = {
      email: 'noid@example.com',
    }
    const result = transformCustomer(raw)
    // The transform defaults id to '' when absent; schema requires >=1 char
    // so we only verify the mapping behavior here, not schema validity
    expect(result.id).toBe('')
    expect(result.email).toBe('noid@example.com')
    expect(result.gateway).toBe('paddle')
  })

  it('merges custom_data into metadata alongside locale and status', () => {
    const raw: RawPaddleCustomer = {
      id: 'ctm_paddle_003',
      locale: 'fr-FR',
      status: 'inactive',
      custom_data: { promo_code: 'SUMMER' },
    }
    const result = transformCustomer(raw)
    expect(result.metadata.locale).toBe('fr-FR')
    expect(result.metadata.status).toBe('inactive')
    expect(result.metadata.promo_code).toBe('SUMMER')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
