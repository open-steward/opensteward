import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawPayPalPayer,
} from '../../../../../../../src/verticals/payments/adapters/paypal/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('paypal transformCustomer', () => {
  it('maps payer_id and email to canonical customer', () => {
    const raw: RawPayPalPayer = {
      payer_id: 'PAYERID123',
      email_address: 'john@example.com',
      name: { given_name: 'John', surname: 'Doe' },
      phone: { phone_number: { national_number: '5551234567' } },
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('PAYERID123')
    expect(result.email).toBe('john@example.com')
    expect(result.name).toBe('John Doe')
    expect(result.phone).toBe('5551234567')
    expect(result.gateway).toBe('paypal')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to email as id when payer_id is absent', () => {
    const raw: RawPayPalPayer = {
      email_address: 'anon@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('anon@example.com')
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('joins given_name and surname with a space', () => {
    const raw: RawPayPalPayer = {
      payer_id: 'P1',
      name: { given_name: 'Alice', surname: 'Smith' },
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Alice Smith')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
