import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawNmiCustomer,
} from '../../../../../../../src/verticals/payments/adapters/nmi/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('nmi transformCustomer', () => {
  it('maps a full customer vault record', () => {
    const raw: RawNmiCustomer = {
      customerVaultId: 'vault-001',
      firstName: 'Jane',
      lastName: 'Doe',
      company: 'ACME Corp',
      email: 'jane.doe@example.com',
      phone: '+15551234567',
      address: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62701',
      country: 'US',
      created: '20240301000000',
      updated: '20240301000000',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('vault-001')
    expect(result.externalId).toBe('vault-001')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.phone).toBe('+15551234567')
    expect(result.gateway).toBe('nmi')
    expect(result.metadata['company']).toBe('ACME Corp')
    expect(result.metadata['address']).toBe('123 Main St')
    expect(result.metadata['city']).toBe('Springfield')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to company name when firstName and lastName are absent', () => {
    const raw: RawNmiCustomer = {
      customerVaultId: 'vault-002',
      company: 'Widget LLC',
      email: 'info@widget.example.com',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Widget LLC')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles a minimal customer with only vault ID', () => {
    const raw: RawNmiCustomer = {
      customerVaultId: 'vault-003',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('vault-003')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('parses NMI compact datetime for createdAt and updatedAt', () => {
    const raw: RawNmiCustomer = {
      customerVaultId: 'vault-004',
      created: '20240301120000',
      updated: '20240315080000',
    }
    const result = transformCustomer(raw)
    expect(result.createdAt).toBe('2024-03-01T12:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-15T08:00:00.000Z')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
