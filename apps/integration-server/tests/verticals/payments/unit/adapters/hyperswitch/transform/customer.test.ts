import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawHyperswitchCustomer,
} from '../../../../../../../src/verticals/payments/adapters/hyperswitch/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('hyperswitch transformCustomer', () => {
  it('maps a full customer record correctly', () => {
    const raw: RawHyperswitchCustomer = {
      customer_id: 'cus_001',
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '5550123',
      phone_country_code: '+1',
      description: 'Key account',
      default_payment_method_id: 'pm_001',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_001')
    expect(result.externalId).toBe('cus_001')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    // Phone is concatenated when country code is present
    expect(result.phone).toBe('+15550123')
    expect(result.defaultPaymentMethodId).toBe('pm_001')
    expect(result.gateway).toBe('hyperswitch')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('uses phone alone when phone_country_code is absent', () => {
    const raw: RawHyperswitchCustomer = {
      customer_id: 'cus_002',
      phone: '+447700900000',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.phone).toBe('+447700900000')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps metadata record via strMap', () => {
    const raw: RawHyperswitchCustomer = {
      customer_id: 'cus_003',
      metadata: { tier: 'gold', region: 'APAC' },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.metadata['tier']).toBe('gold')
    expect(result.metadata['region']).toBe('APAC')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
