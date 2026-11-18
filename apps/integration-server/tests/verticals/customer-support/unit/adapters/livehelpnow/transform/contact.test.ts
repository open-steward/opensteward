import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawLivehelpnowContact,
} from '../../../../../../../src/verticals/customer-support/adapters/livehelpnow/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('livehelpnow transformContact', () => {
  it('maps VisitorID to id and externalId', () => {
    const raw: RawLivehelpnowContact = {
      VisitorID: 'vis-abc',
      Detail1: 'Jane Doe',
      Detail2: 'jane@example.com',
    }
    const result = transformContact(raw)
    expect(result.id).toBe('vis-abc')
    expect(result.externalId).toBe('vis-abc')
  })

  it('maps Detail1 to name', () => {
    const raw: RawLivehelpnowContact = { VisitorID: 'v1', Detail1: 'John Smith' }
    const result = transformContact(raw)
    expect(result.name).toBe('John Smith')
  })

  it('maps Detail2 to email', () => {
    const raw: RawLivehelpnowContact = {
      VisitorID: 'v2',
      Detail1: 'User',
      Detail2: 'user@example.com',
    }
    const result = transformContact(raw)
    expect(result.email).toBe('user@example.com')
  })

  it('returns undefined email when Detail2 absent', () => {
    const raw: RawLivehelpnowContact = { VisitorID: 'v3', Detail1: 'Anonymous' }
    const result = transformContact(raw)
    expect(result.email).toBeUndefined()
  })

  it('sets platform to livehelpnow', () => {
    const raw: RawLivehelpnowContact = { VisitorID: 'v4', Detail1: 'Test' }
    const result = transformContact(raw)
    expect(result.platform).toBe('livehelpnow')
  })

  it('stores department in metadata', () => {
    const raw: RawLivehelpnowContact = { VisitorID: 'v5', Detail1: 'User', Department: 'Sales' }
    const result = transformContact(raw)
    expect(result.metadata['department']).toBe('Sales')
  })

  it('passes ContactSchema validation', () => {
    const raw: RawLivehelpnowContact = {
      VisitorID: 'vis-99',
      Detail1: 'Valid User',
      Detail2: 'valid@example.com',
      Department: 'Support',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
