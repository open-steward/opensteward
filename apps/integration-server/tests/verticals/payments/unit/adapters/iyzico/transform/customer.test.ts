import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawIyzicoSubscriber,
} from '../../../../../../../src/verticals/payments/adapters/iyzico/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('iyzico transformCustomer', () => {
  it('maps referenceCode, joined name, email and phone', () => {
    const raw: RawIyzicoSubscriber = {
      referenceCode: 'sub-ref-001',
      name: 'Ahmet',
      surname: 'Yilmaz',
      email: 'ahmet@example.com',
      gsmNumber: '+905551234567',
      status: 'ACTIVE',
      createdDate: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('sub-ref-001')
    expect(result.externalId).toBe('sub-ref-001')
    expect(result.name).toBe('Ahmet Yilmaz')
    expect(result.email).toBe('ahmet@example.com')
    expect(result.phone).toBe('+905551234567')
    expect(result.gateway).toBe('iyzico')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps billingAddress and shippingAddress (omitting country)', () => {
    const raw: RawIyzicoSubscriber = {
      referenceCode: 'sub-ref-002',
      billingAddress: {
        contactName: 'Jane',
        city: 'Istanbul',
        country: 'Turkey',
        address: '123 Main St',
        zipCode: '34000',
      },
      shippingAddress: {
        contactName: 'Jane',
        city: 'Ankara',
        country: 'Turkey',
        address: '456 Other St',
        zipCode: '06000',
      },
    }
    const result = transformCustomer(raw)
    expect(result.billingAddress?.city).toBe('Istanbul')
    expect(result.billingAddress?.postalCode).toBe('34000')
    expect(result.shippingAddress?.city).toBe('Ankara')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
