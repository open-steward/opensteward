import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawPagarmeCustomer,
} from '../../../../../../../src/verticals/payments/adapters/pagarme/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('pagarme transformCustomer', () => {
  it('maps core fields to canonical customer', () => {
    const raw: RawPagarmeCustomer = {
      id: 'cus_abc',
      code: 'EXT-001',
      email: 'user@example.com',
      name: 'Ana Silva',
      delinquent: false,
      created_at: '2024-01-15T00:00:00Z',
      updated_at: '2024-02-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_abc')
    expect(result.externalId).toBe('EXT-001')
    expect(result.email).toBe('user@example.com')
    expect(result.name).toBe('Ana Silva')
    expect(result.delinquent).toBe(false)
    expect(result.gateway).toBe('pagarme')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('formats mobile phone with country code', () => {
    const raw: RawPagarmeCustomer = {
      id: 'cus_phone',
      phones: {
        mobile_phone: { country_code: '55', area_code: '11', number: '987654321' },
        home_phone: { country_code: '55', area_code: '11', number: '33334444' },
      },
    }
    const result = transformCustomer(raw)
    // mobile_phone takes priority over home_phone
    expect(result.phone).toBe('+5511987654321')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to home phone when mobile is absent', () => {
    const raw: RawPagarmeCustomer = {
      id: 'cus_home',
      phones: {
        home_phone: { country_code: '55', area_code: '21', number: '22223333' },
      },
    }
    const result = transformCustomer(raw)
    expect(result.phone).toBe('+552122223333')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('puts document and type into metadata', () => {
    const raw: RawPagarmeCustomer = {
      id: 'cus_doc',
      document: '123.456.789-00',
      document_type: 'CPF',
      type: 'individual',
      gender: 'male',
    }
    const result = transformCustomer(raw)
    expect(result.metadata['document']).toBe('123.456.789-00')
    expect(result.metadata['document_type']).toBe('CPF')
    expect(result.metadata['type']).toBe('individual')
    expect(result.metadata['gender']).toBe('male')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back id to externalId when code is absent', () => {
    const raw: RawPagarmeCustomer = {
      id: 'cus_nocode',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_nocode')
    expect(result.externalId).toBe('cus_nocode')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
