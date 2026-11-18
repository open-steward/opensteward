import { describe, it, expect } from 'vitest'
import { transformCustomer } from '../../../../../../../src/verticals/payments/adapters/rapyd/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('rapyd transformCustomer', () => {
  it('maps a full customer object to canonical shape', () => {
    const raw = {
      id: 'cus_rapyd_1',
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone_number: '+14155550123',
      default_payment_method: 'pm_card_1',
      description: 'VIP customer',
      delinquent: false,
      created_at: 1_700_000_000,
      metadata: { tier: 'pro' },
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_rapyd_1')
    expect(result.externalId).toBe('cus_rapyd_1')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.phone).toBe('+14155550123')
    expect(result.defaultPaymentMethodId).toBe('pm_card_1')
    expect(result.delinquent).toBe(false)
    expect(result.description).toBe('VIP customer')
    expect(result.gateway).toBe('rapyd')
    expect(result.metadata.tier).toBe('pro')
    expect(result.createdAt).toMatch(/^2023-/)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles minimal customer (only id) without throwing', () => {
    const raw = {
      id: 'cus_minimal',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_minimal')
    expect(result.email).toBeUndefined()
    expect(result.gateway).toBe('rapyd')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps delinquent flag correctly', () => {
    const raw = {
      id: 'cus_delinquent',
      delinquent: true,
    }
    const result = transformCustomer(raw)
    expect(result.delinquent).toBe(true)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
