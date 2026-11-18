/**
 * Fixture: the documented example of
 * https://docs.ada.cx/reference/end-users/get-end-users (the same shape as
 * GET /v2/end-users/{end_user_id}).
 */
import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawAdaEndUser,
} from '../../../../../../../src/verticals/customer-support/adapters/ada-cx/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

const documented: RawAdaEndUser = {
  end_user_id: '5f7e0e2c1e7c7e000f0f9c3a',
  profile: {
    first_name: 'Ada',
    last_name: 'Lovelace',
    display_name: 'Ada Lovelace',
    avatar: 'https://example.com/avatars/ada.png',
    email: 'ada.lovelace@ada.cx',
    language: 'en-US',
    metadata: {
      example_key1: 'example_string_value',
      example_key2: true,
      example_key3: 123,
    },
    system_properties: { sunshine_user_id: '5f7e0e2c1e7c7e000f0f9c3a' },
  },
  created_at: '2020-09-20T00:00:00+00:00',
  updated_at: '2020-09-20T00:00:00+00:00',
}

describe('ada-cx transformContact', () => {
  it('parses the documented example against ContactSchema', () => {
    const out = ContactSchema.parse(transformContact(documented))
    expect(out).toMatchObject({
      id: '5f7e0e2c1e7c7e000f0f9c3a',
      externalId: '5f7e0e2c1e7c7e000f0f9c3a',
      email: 'ada.lovelace@ada.cx',
      name: 'Ada Lovelace',
      platform: 'ada-cx',
    })
    expect(out.metadata['language']).toBe('en-US')
    expect(out.phone).toBeUndefined()
  })

  it('builds the name from first and last name when display_name is null', () => {
    const out = transformContact({
      ...documented,
      profile: { ...documented.profile, display_name: null },
    })
    expect(out.name).toBe('Ada Lovelace')
  })

  it('keeps the caller-supplied external_id in metadata, not as externalId', () => {
    const out = ContactSchema.parse(transformContact({ ...documented, external_id: 'crm-42' }))
    expect(out.externalId).toBe('5f7e0e2c1e7c7e000f0f9c3a')
    expect(out.metadata['adaExternalId']).toBe('crm-42')
  })

  it('does not read arbitrary profile.metadata keys as PII', () => {
    const out = transformContact({
      ...documented,
      profile: { metadata: { email: 'x@y.example', phone: '+1555' } },
    })
    expect(out.email).toBeUndefined()
    expect(out.phone).toBeUndefined()
    expect(out.name).toBe('')
  })

  it('throws on a record with no end_user_id', () => {
    expect(() => transformContact({ ...documented, end_user_id: undefined })).toThrow(/end_user_id/)
  })
})
