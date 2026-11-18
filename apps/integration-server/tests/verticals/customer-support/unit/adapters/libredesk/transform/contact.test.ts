import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawLibredeskContact,
} from '../../../../../../../src/verticals/customer-support/adapters/libredesk/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('libredesk transformContact', () => {
  it('concatenates first_name and last_name', () => {
    const raw: RawLibredeskContact = { id: 1, first_name: 'Jane', last_name: 'Doe' }
    const result = transformContact(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('uses only first_name when last_name is absent', () => {
    const raw: RawLibredeskContact = { id: 2, first_name: 'Alice' }
    const result = transformContact(raw)
    expect(result.name).toBe('Alice')
  })

  it('prefers external_user_id as externalId over id', () => {
    const raw: RawLibredeskContact = { id: 3, external_user_id: 'ext-abc' }
    const result = transformContact(raw)
    expect(result.externalId).toBe('ext-abc')
    expect(result.id).toBe('3')
  })

  it('falls back to string(id) for externalId when external_user_id absent', () => {
    const raw: RawLibredeskContact = { id: 4, first_name: 'Bob' }
    const result = transformContact(raw)
    expect(result.externalId).toBe('4')
  })

  it('maps email from raw.email', () => {
    const raw: RawLibredeskContact = { id: 5, email: 'bob@example.com' }
    const result = transformContact(raw)
    expect(result.email).toBe('bob@example.com')
  })

  it('maps phone_number to phone', () => {
    const raw: RawLibredeskContact = { id: 6, phone_number: '+14155550123' }
    const result = transformContact(raw)
    expect(result.phone).toBe('+14155550123')
  })

  it('sets platform to libredesk', () => {
    const raw: RawLibredeskContact = { id: 7 }
    const result = transformContact(raw)
    expect(result.platform).toBe('libredesk')
  })

  it('passes ContactSchema validation', () => {
    const raw: RawLibredeskContact = {
      id: 99,
      external_user_id: 'ext-99',
      first_name: 'Valid',
      last_name: 'Contact',
      email: 'valid@example.com',
      phone_number: '+14155550199',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
