import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawAmazonPayChargePermission,
} from '../../../../../../../src/verticals/payments/adapters/amazon-pay/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('amazon-pay transformCustomer', () => {
  it('maps a charge permission to a customer with buyer contact fields', () => {
    const raw: RawAmazonPayChargePermission = {
      chargePermissionId: 'CP-001',
      buyer: {
        buyerId: 'B-001',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phoneNumber: '+1-555-0100',
      },
      presentmentCurrency: 'usd',
      creationTimestamp: '2024-03-01T00:00:00Z',
      statusDetails: {
        state: 'Chargeable',
        lastUpdatedTimestamp: '2024-03-01T00:00:00Z',
      },
    }
    const result = transformCustomer(raw)

    expect(result.id).toBe('CP-001')
    expect(result.name).toBe('Jane Doe')
    expect(result.email).toBe('jane@example.com')
    expect(result.phone).toBe('+1-555-0100')
    // presentmentCurrency is uppercased
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('amazon-pay')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to billing address phone when buyer has none', () => {
    const raw: RawAmazonPayChargePermission = {
      chargePermissionId: 'CP-002',
      buyer: { name: 'John Smith' },
      billingAddress: {
        phoneNumber: '+44-20-1234-5678',
        city: 'London',
        countryCode: 'GB',
      },
    }
    const result = transformCustomer(raw)

    expect(result.id).toBe('CP-002')
    expect(result.name).toBe('John Smith')
    expect(result.phone).toBe('+44-20-1234-5678')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('produces a valid customer even with minimal data', () => {
    const raw: RawAmazonPayChargePermission = {
      chargePermissionId: 'CP-003',
    }
    const result = transformCustomer(raw)

    expect(result.id).toBe('CP-003')
    expect(result.gateway).toBe('amazon-pay')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
