/**
 * Fixtures are built from the documented examples in the Keap REST v2 OpenAPI
 * spec (https://crm.infusionsoft.com/app/v3/api-docs/V2). The spec types ids
 * and timestamps as strings, so the fixture values are strings.
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawKeapContact,
} from '../../../../../../../src/verticals/crm/adapters/keap/transform/contact'

/** Documented `Contact` example values. */
const DOC: RawKeapContact = {
  id: '1001',
  given_name: 'John',
  family_name: 'Smith',
  job_title: 'Senior Software Engineer',
  owner_id: '45',
  company: { id: '100', company_name: 'Thryv' },
  email_addresses: [{ email: 'john.smith@example.com', field: 'EMAIL1' }],
  phone_numbers: [{ number: '5551234567', field: 'PHONE1' }],
  create_time: '2024-01-10T08:00:00Z',
  update_time: '2024-03-15T10:30:00Z',
}

describe('keap transformContact', () => {
  it('maps the documented example and satisfies the schema', () => {
    const result = ContactSchema.parse(transformContact(DOC))
    expect(result).toMatchObject({
      id: '1001',
      first_name: 'John',
      last_name: 'Smith',
      email: 'john.smith@example.com',
      phone: '5551234567',
      title: 'Senior Software Engineer',
      company_id: '100',
      owner_id: '45',
      created_at: '2024-01-10T08:00:00Z',
      updated_at: '2024-03-15T10:30:00Z',
    })
  })

  it('a bare record satisfies the schema', () => {
    expect(() => ContactSchema.parse(transformContact({ id: '7' }))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    expect(transformContact(DOC).metadata).toBe(DOC)
  })
})

describe('keap untransformContact', () => {
  it('maps email to email_addresses array', () => {
    const result = untransformContact({ email: 'k@example.com' })
    expect((result.email_addresses as Array<{ email: string }>)[0].email).toBe('k@example.com')
  })
})
