import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawCheckoutCustomer,
} from '../../../../../../../src/verticals/payments/adapters/checkout-com/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('checkout-com transformCustomer', () => {
  it('maps a full customer with phone and default payment method', () => {
    const raw: RawCheckoutCustomer = {
      id: 'cus_001',
      email: 'alice@example.com',
      name: 'Alice Smith',
      phone: { country_code: '+44', number: '7700900123' },
      default: 'src_001',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Smith')
    expect(result.phone).toBe('7700900123')
    expect(result.defaultPaymentMethodId).toBe('src_001')
    expect(result.gateway).toBe('checkout-com')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal customer with only an id', () => {
    const raw: RawCheckoutCustomer = {
      id: 'cus_002',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_002')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.defaultPaymentMethodId).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('sets phone from phone.number field', () => {
    const raw: RawCheckoutCustomer = {
      id: 'cus_003',
      email: 'bob@example.com',
      phone: { number: '5551234567' },
    }
    const result = transformCustomer(raw)
    expect(result.phone).toBe('5551234567')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
