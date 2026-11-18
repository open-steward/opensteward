import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawVendastaContact,
} from '../../../../../../../src/verticals/crm/adapters/vendasta/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawVendastaContact> = {}): RawVendastaContact {
  return {
    crmObjectId: 'cont_001',
    ownerId: 'usr_owner',
    created: '2026-01-15T09:30:00.000Z',
    updated: '2026-02-01T14:20:00.000Z',
    fields: [
      { fieldId: 'standard__first_name', stringValue: 'Jane' },
      { fieldId: 'standard__last_name', stringValue: 'Doe' },
      { fieldId: 'standard__email', stringValue: 'jane.doe@acme.example' },
      { fieldId: 'standard__phone_number', stringValue: '+14155550123' },
      { fieldId: 'standard__contact_mobile_phone_number', stringValue: '+14155550124' },
      { fieldId: 'standard__contact_job_title', stringValue: 'Head of Finance' },
      { fieldId: 'standard__contact_primary_company_id', stringValue: 'co_acme' },
      { fieldId: 'system__contact_owner_id', stringValue: 'usr_fallback' },
      { fieldId: 'standard__contact_lifecycle_stage', stringValue: 'customer' },
      { fieldId: 'standard__tags', stringValue: 'vip,q1-expansion' },
      {
        fieldId: 'standard__contact_primary_location_street_address_1',
        stringValue: '123 Main St',
      },
      { fieldId: 'standard__contact_primary_location_city_locality', stringValue: 'San Francisco' },
      { fieldId: 'standard__contact_primary_location_state_province_region', stringValue: 'CA' },
      { fieldId: 'standard__contact_primary_location_country', stringValue: 'US' },
      { fieldId: 'standard__contact_primary_location_zip_postal_code', stringValue: '94105' },
    ],
    ...overrides,
  }
}

describe('vendasta transformContact', () => {
  it('maps id from crmObjectId', () => {
    expect(transformContact(makeRaw()).id).toBe('cont_001')
  })

  it('maps first_name and last_name from respective fields', () => {
    const result = transformContact(makeRaw())
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('joins first and last name into name', () => {
    expect(transformContact(makeRaw()).name).toBe('Jane Doe')
  })

  it('maps email from standard__email field', () => {
    expect(transformContact(makeRaw()).email).toBe('jane.doe@acme.example')
  })

  it('maps phone from standard__phone_number field', () => {
    expect(transformContact(makeRaw()).phone).toBe('+14155550123')
  })

  it('maps mobile from standard__contact_mobile_phone_number field', () => {
    expect(transformContact(makeRaw()).mobile).toBe('+14155550124')
  })

  it('maps title from standard__contact_job_title field', () => {
    expect(transformContact(makeRaw()).title).toBe('Head of Finance')
  })

  it('maps company_id from standard__contact_primary_company_id field', () => {
    expect(transformContact(makeRaw()).company_id).toBe('co_acme')
  })

  it('maps stage from standard__contact_lifecycle_stage field', () => {
    expect(transformContact(makeRaw()).stage).toBe('customer')
  })

  it('splits comma-separated tags', () => {
    expect(transformContact(makeRaw()).tags).toEqual(['vip', 'q1-expansion'])
  })

  it('maps address fields', () => {
    const address = transformContact(makeRaw()).address
    expect(address?.line1).toBe('123 Main St')
    expect(address?.city).toBe('San Francisco')
    expect(address?.region).toBe('CA')
    expect(address?.country).toBe('US')
    expect(address?.postalCode).toBe('94105')
  })

  it('prefers raw.ownerId over system__contact_owner_id field', () => {
    expect(transformContact(makeRaw()).owner_id).toBe('usr_owner')
  })

  it('maps timestamps from raw.created and raw.updated', () => {
    const result = transformContact(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw as metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => ContactSchema.parse(transformContact(makeRaw()))).not.toThrow()
  })

  it('handles missing optional fields without throwing', () => {
    const minimal: RawVendastaContact = { crmObjectId: 'cont_min', fields: [] }
    expect(() => ContactSchema.parse(transformContact(minimal))).not.toThrow()
  })

  it('name is undefined when both first and last name are absent', () => {
    const raw = makeRaw({ fields: [] })
    expect(transformContact(raw).name).toBeUndefined()
  })
})

describe('vendasta untransformContact', () => {
  it('maps first_name to standard__first_name field', () => {
    const fields = untransformContact({ first_name: 'Jane' })
    const found = fields.find((f) => f.fieldId === 'standard__first_name')
    expect(found?.stringValue).toBe('Jane')
  })

  it('maps email to standard__email field', () => {
    const fields = untransformContact({ email: 'jane@acme.example' })
    const found = fields.find((f) => f.fieldId === 'standard__email')
    expect(found?.stringValue).toBe('jane@acme.example')
  })

  it('maps mobile to standard__contact_mobile_phone_number field', () => {
    const fields = untransformContact({ mobile: '+14155550124' })
    const found = fields.find((f) => f.fieldId === 'standard__contact_mobile_phone_number')
    expect(found?.stringValue).toBe('+14155550124')
  })

  it('maps title to standard__contact_job_title field', () => {
    const fields = untransformContact({ title: 'Head of Finance' })
    const found = fields.find((f) => f.fieldId === 'standard__contact_job_title')
    expect(found?.stringValue).toBe('Head of Finance')
  })

  it('joins tags with comma', () => {
    const fields = untransformContact({ tags: ['vip', 'q1-expansion'] })
    const found = fields.find((f) => f.fieldId === 'standard__tags')
    expect(found?.stringValue).toBe('vip,q1-expansion')
  })
})
