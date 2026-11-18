import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawMethodContact,
} from '../../../../../../../src/verticals/crm/adapters/method-crm/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawMethodContact> = {}): RawMethodContact {
  return {
    RecordId: '5',
    FirstName: 'Jane',
    LastName: 'Doe',
    Email: 'jane.doe@acme.example',
    Phone: '+14155550123',
    AltPhone: '+14155550124',
    CreatedDate: '2026-01-15T09:30:00.000Z',
    ModifiedDate: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('method-crm transformContact', () => {
  it('maps RecordId (number) to string id', () => {
    expect(transformContact(makeRaw({ RecordId: 5 })).id).toBe('5')
  })

  it('maps FirstName and LastName', () => {
    const result = transformContact(makeRaw())
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('builds name from first + last', () => {
    expect(transformContact(makeRaw()).name).toBe('Jane Doe')
  })

  it('maps Email to email', () => {
    expect(transformContact(makeRaw()).email).toBe('jane.doe@acme.example')
  })

  it('maps Phone to phone and AltPhone to mobile', () => {
    const result = transformContact(makeRaw())
    expect(result.phone).toBe('+14155550123')
    expect(result.mobile).toBe('+14155550124')
  })

  it('maps CreatedDate / ModifiedDate', () => {
    const result = transformContact(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('omits name when both first and last are absent', () => {
    const result = transformContact(makeRaw({ FirstName: undefined, LastName: undefined }))
    expect(result.name).toBeUndefined()
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformContact(makeRaw()))).not.toThrow()
  })

  it('untransformContact maps first_name, last_name, email, phone, mobile', () => {
    const out = untransformContact({
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone: '+1111',
      mobile: '+2222',
    })
    expect(out.FirstName).toBe('Jane')
    expect(out.LastName).toBe('Doe')
    expect(out.Email).toBe('jane@example.com')
    expect(out.Phone).toBe('+1111')
    expect(out.AltPhone).toBe('+2222')
  })
})
