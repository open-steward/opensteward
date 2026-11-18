import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type GustoContact } from '../../../../../../../src/verticals/accounting/adapters/gusto/transform/contact'

function makeContact(overrides: Partial<GustoContact> = {}): GustoContact {
  return {
    id: 'emp_001',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane.smith@example.com',
    phone: '555-1234',
    ...overrides,
  }
}

describe('transformContact (Gusto)', () => {
  it('maps id to string', () => {
    expect(transformContact(makeContact({ id: 'emp_001' })).id).toBe('emp_001')
  })

  it('maps numeric id to string', () => {
    expect(transformContact(makeContact({ id: 7 })).id).toBe('7')
  })

  it('composes name from first_name and last_name', () => {
    const result = transformContact(makeContact({ first_name: 'John', last_name: 'Doe' }))
    expect(result.name).toBe('John Doe')
  })

  it('maps email to work email', () => {
    const result = transformContact(makeContact({ email: 'jane@example.com' }))
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('jane@example.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeContact({ phone: '555-9876' }))
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('555-9876')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('omits telephones when phone is absent', () => {
    const result = transformContact(makeContact({ phone: undefined }))
    expect(result.telephones).toBeUndefined()
  })

  it('maps address when present', () => {
    const result = transformContact(
      makeContact({
        address: {
          street_1: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          zip: '62701',
          country: 'US',
        },
      }),
    )
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('Springfield')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact({ id: 'emp_001' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
