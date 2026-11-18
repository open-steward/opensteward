import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawDocument360Reader,
} from '../../../../../../../src/verticals/customer-support/adapters/document360/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('document360 transformContact', () => {
  const raw: RawDocument360Reader = {
    reader_id: 'reader-42',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane.doe@example.com',
    last_login_at: '2024-03-15T10:00:00.000Z',
    is_invite_sso_user: false,
    access_scope: { access_level: 'full' },
    associated_reader_groups: ['grp-1'],
  }

  it('maps reader_id to id and externalId', () => {
    const result = transformContact(raw)
    expect(result.id).toBe('reader-42')
    expect(result.externalId).toBe('reader-42')
  })

  it('sets platform to document360', () => {
    const result = transformContact(raw)
    expect(result.platform).toBe('document360')
  })

  it('maps email field', () => {
    const result = transformContact(raw)
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('builds name from first_name + last_name', () => {
    const result = transformContact(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('stores accessLevel in metadata', () => {
    const result = transformContact(raw)
    expect(result.metadata['accessLevel']).toBe('full')
  })

  it('produces a ContactSchema-valid result', () => {
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('handles minimal input — no name parts', () => {
    const minimal: RawDocument360Reader = { reader_id: 'x' }
    const result = transformContact(minimal)
    expect(result.id).toBe('x')
    expect(result.name).toBe('')
    expect(result.email).toBeUndefined()
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
