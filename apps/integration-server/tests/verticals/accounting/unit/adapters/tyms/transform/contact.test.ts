import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type TymsContact,
} from '../../../../../../../src/verticals/accounting/adapters/tyms/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeContact(overrides: Partial<TymsContact> = {}): TymsContact {
  return {
    uuid: 'con-001',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+15551234567',
    type: 'Customer',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('con-001')
    expect(result.name).toBe('Jane Doe')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email to WORK type', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toBeDefined()
    expect(result.emails![0].email).toBe('jane@example.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to WORK telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toBeDefined()
    expect(result.telephones![0].telephone).toBe('+15551234567')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps Vendor type to isSupplier=true and isCustomer=false', () => {
    const result = transformContact(makeContact({ type: 'Vendor' }))
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('defaults to isCustomer=true when type is absent', () => {
    const result = transformContact(makeContact({ type: undefined }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('parses dates as Date objects', () => {
    const result = transformContact(makeContact())
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('passes raw as metadata', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
