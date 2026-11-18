import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawIxopayCustomer,
} from '../../../../../../../src/verticals/payments/adapters/ixopay/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('ixopay transformCustomer', () => {
  it('maps profileGuid, customerData fields and joins name', () => {
    const raw: RawIxopayCustomer = {
      profileGuid: 'guid-001',
      customerIdentification: 'merchant-cust-001',
      customerData: {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        phone: '+49123456789',
        billingCountry: 'DE',
      },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('merchant-cust-001')
    expect(result.externalId).toBe('guid-001')
    expect(result.name).toBe('Jane Doe')
    expect(result.email).toBe('jane@example.com')
    expect(result.phone).toBe('+49123456789')
    expect(result.gateway).toBe('ixopay')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('uses profileGuid as id when customerIdentification is absent', () => {
    const raw: RawIxopayCustomer = {
      profileGuid: 'guid-002',
      customerData: { email: 'user@example.com' },
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('guid-002')
    expect(result.externalId).toBe('guid-002')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
