import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawTipaltiPayee,
} from '../../../../../../../src/verticals/payments/adapters/tipalti/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('tipalti transformCustomer', () => {
  it('maps a payee with company name and contact info', () => {
    const raw: RawTipaltiPayee = {
      id: 'payee-001',
      refCode: 'PAYEE-REF-001',
      status: 'ACTIVE',
      entityType: 'COMPANY',
      isPayable: true,
      contactInformation: {
        email: 'vendor@example.com',
        companyName: 'Acme Corp',
        phone: '+14155550123',
        paymentCountryCode: 'US',
      },
      paymentMethod: {
        paymentMethodType: 'ACH',
        currency: 'USD',
      },
      lastChangeDateTimeUTC: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('payee-001')
    expect(result.externalId).toBe('PAYEE-REF-001')
    expect(result.email).toBe('vendor@example.com')
    expect(result.name).toBe('Acme Corp')
    expect(result.phone).toBe('+14155550123')
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('tipalti')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a payee with first/last name (individual)', () => {
    const raw: RawTipaltiPayee = {
      id: 'payee-002',
      refCode: 'PAYEE-REF-002',
      status: 'ACTIVE',
      entityType: 'INDIVIDUAL',
      contactInformation: {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
      },
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('John Doe')
    expect(result.email).toBe('john.doe@example.com')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
