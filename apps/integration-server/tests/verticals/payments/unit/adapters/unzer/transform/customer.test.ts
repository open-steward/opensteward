import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawUnzerCustomer,
} from '../../../../../../../src/verticals/payments/adapters/unzer/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('unzer transformCustomer', () => {
  it('maps a full customer record correctly', () => {
    const raw: RawUnzerCustomer = {
      id: 's-cst-001',
      firstname: 'Jane',
      lastname: 'Doe',
      salutation: 'mrs',
      company: 'Acme Corp',
      customerId: 'ext-cust-001',
      birthDate: '1990-01-15',
      email: 'jane.doe@example.com',
      phone: '+49301234567',
      mobile: '+4915112345678',
      billingAddress: {
        name: 'Jane Doe',
        street: '123 Main St',
        city: 'Berlin',
        zip: '10115',
        country: 'de',
        state: 'Berlin',
      },
      shippingAddress: {
        name: 'Jane Doe',
        street: '456 Elm St',
        city: 'Munich',
        zip: '80331',
        country: 'de',
      },
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('s-cst-001')
    expect(result.externalId).toBe('s-cst-001')
    expect(result.name).toBe('Jane Doe')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.phone).toBe('+49301234567')
    expect(result.gateway).toBe('unzer')
    expect(result.billingAddress?.city).toBe('Berlin')
    expect(result.billingAddress?.country).toBe('DE')
    expect(result.billingAddress?.postalCode).toBe('10115')
    expect(result.billingAddress?.region).toBe('Berlin')
    expect(result.shippingAddress?.city).toBe('Munich')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal customer (id only)', () => {
    const raw: RawUnzerCustomer = {
      id: 's-cst-002',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('s-cst-002')
    expect(result.name).toBeUndefined()
    expect(result.email).toBeUndefined()
    expect(result.billingAddress).toBeUndefined()
    expect(result.shippingAddress).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to customerId when id is missing', () => {
    const raw: RawUnzerCustomer = {
      customerId: 'ext-999',
      firstname: 'John',
      email: 'john@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('ext-999')
    expect(result.externalId).toBe('ext-999')
    expect(result.name).toBe('John')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('uses mobile as phone fallback when phone is absent', () => {
    const raw: RawUnzerCustomer = {
      id: 's-cst-003',
      mobile: '+4915112345678',
    }
    const result = transformCustomer(raw)
    expect(result.phone).toBe('+4915112345678')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits address when all address fields are empty', () => {
    const raw: RawUnzerCustomer = {
      id: 's-cst-004',
      billingAddress: {},
    }
    const result = transformCustomer(raw)
    expect(result.billingAddress).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('uppercases country code in address', () => {
    const raw: RawUnzerCustomer = {
      id: 's-cst-005',
      billingAddress: { country: 'fr', city: 'Paris' },
    }
    const result = transformCustomer(raw)
    expect(result.billingAddress?.country).toBe('FR')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('stores company and salutation in metadata', () => {
    const raw: RawUnzerCustomer = {
      id: 's-cst-006',
      company: 'BigCorp',
      salutation: 'mr',
      birthDate: '1985-06-20',
    }
    const result = transformCustomer(raw)
    expect(result.metadata.company).toBe('BigCorp')
    expect(result.metadata.salutation).toBe('mr')
    expect(result.metadata.birthDate).toBe('1985-06-20')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('unzer untransformCustomer', () => {
  it('splits a full name into firstname and lastname', () => {
    const result = untransformCustomer({ name: 'John Doe' })
    expect(result.firstname).toBe('John')
    expect(result.lastname).toBe('Doe')
  })

  it('handles single-word name as firstname only', () => {
    const result = untransformCustomer({ name: 'Madonna' })
    expect(result.firstname).toBe('Madonna')
    expect(result.lastname).toBeUndefined()
  })

  it('passes through email and phone', () => {
    const result = untransformCustomer({ email: 'a@b.com', phone: '+1234567890' })
    expect(result.email).toBe('a@b.com')
    expect(result.phone).toBe('+1234567890')
  })

  it('returns empty object for empty input', () => {
    const result = untransformCustomer({})
    expect(Object.keys(result).length).toBe(0)
  })
})
