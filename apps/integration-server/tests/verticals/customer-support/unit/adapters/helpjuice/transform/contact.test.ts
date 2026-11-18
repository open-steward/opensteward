import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawHelpjuiceUser,
} from '../../../../../../../src/verticals/customer-support/adapters/helpjuice/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('helpjuice transformContact', () => {
  it('uses name field when present', () => {
    const raw: RawHelpjuiceUser = {
      id: 1,
      name: 'Jane Doe',
      email: 'jane@example.com',
    }
    const result = transformContact(raw)
    expect(result.name).toBe('Jane Doe')
    expect(result.email).toBe('jane@example.com')
  })

  it('concatenates first_name and last_name when name is absent', () => {
    const raw: RawHelpjuiceUser = {
      id: 2,
      first_name: 'John',
      last_name: 'Smith',
    }
    const result = transformContact(raw)
    expect(result.name).toBe('John Smith')
  })

  it('uses only first_name when last_name is missing', () => {
    const raw: RawHelpjuiceUser = { id: 3, first_name: 'Alice' }
    const result = transformContact(raw)
    expect(result.name).toBe('Alice')
  })

  it('sets id and externalId from raw.id', () => {
    const raw: RawHelpjuiceUser = { id: 42, name: 'Test User' }
    const result = transformContact(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('sets platform to helpjuice', () => {
    const raw: RawHelpjuiceUser = { id: 5, name: 'Test User' }
    const result = transformContact(raw)
    expect(result.platform).toBe('helpjuice')
  })

  it('passes ContactSchema validation', () => {
    const raw: RawHelpjuiceUser = {
      id: 99,
      name: 'Valid User',
      email: 'valid@example.com',
      role_id: 2,
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('returns undefined email when not provided', () => {
    const raw: RawHelpjuiceUser = { id: 10, name: 'No Email' }
    const result = transformContact(raw)
    expect(result.email).toBeUndefined()
  })
})
