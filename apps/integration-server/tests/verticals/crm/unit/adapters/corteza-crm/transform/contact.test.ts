import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawCortezaContact,
} from '../../../../../../../src/verticals/crm/adapters/corteza-crm/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawCortezaContact> = {}): RawCortezaContact {
  return {
    recordID: 'rec-1',
    moduleID: 'mod-1',
    namespaceID: 'ns-1',
    values: [],
    ...overrides,
  }
}

// Fixture shape: the record in docs.cortezaproject.org "Working With Low Code
// Records" ({ recordID, moduleID, values: [{ name, value }], namespaceID }),
// plus createdAt/updatedAt from server/compose/types/record.go. Field names
// are the module's in corteza-server provision/700_crm/1100_modules.yaml.
describe('corteza-crm transformContact', () => {
  const doc = makeRaw({
    recordID: '312345678901234567',
    moduleID: '212345678901234567',
    namespaceID: '112345678901234567',
    values: [
      { name: 'FirstName', value: 'Jane' },
      { name: 'LastName', value: 'Doe' },
      { name: 'Email', value: 'jane@example.com' },
      { name: 'Phone', value: '+14155550123' },
      { name: 'MobilePhone', value: '+14155550124' },
      { name: 'Title', value: 'CFO' },
      { name: 'AccountId', value: '312345678901234001' },
      { name: 'OwnerId', value: '412345678901234567' },
      { name: 'MailingStreet', value: '1 Main St' },
      { name: 'MailingCity', value: 'Springfield' },
      { name: 'MailingState', value: 'IL' },
      { name: 'MailingPostalCode', value: '62701' },
      { name: 'MailingCountry', value: 'United States' },
    ],
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-02T11:30:00.123456789Z',
  })

  it('maps the documented record to a ContactSchema-valid contact', () => {
    const c = ContactSchema.parse(transformContact(doc))
    expect(c).toMatchObject({
      id: '312345678901234567',
      first_name: 'Jane',
      last_name: 'Doe',
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+14155550123',
      mobile: '+14155550124',
      title: 'CFO',
      company_id: '312345678901234001',
      owner_id: '412345678901234567',
      address: { line1: '1 Main St', city: 'Springfield', region: 'IL', postalCode: '62701' },
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-02T11:30:00.123Z',
    })
  })

  it('leaves the country name out of the ISO address and keeps it in metadata', () => {
    const c = transformContact(doc)
    expect(c.address?.country).toBeUndefined()
    expect(c.metadata).toBe(doc)
  })

  it('omits address when no Mailing* line is present', () => {
    expect(
      transformContact(makeRaw({ values: [{ name: 'MailingCountry', value: 'France' }] })).address,
    ).toBeUndefined()
  })

  it('treats an omitted or empty value as absent', () => {
    const raw = makeRaw({ values: [{ name: 'FirstName' }, { name: 'LastName', value: '' }] })
    const c = ContactSchema.parse(transformContact(raw))
    expect(c.first_name).toBeUndefined()
    expect(c.last_name).toBeUndefined()
    expect(c.name).toBeUndefined()
  })

  it('parses a bare record with the schema', () => {
    expect(() => ContactSchema.parse(transformContact(makeRaw({ recordID: '9' })))).not.toThrow()
  })
})

describe('corteza-crm untransformContact', () => {
  it('maps first_name → FirstName field', () => {
    const values = untransformContact({ first_name: 'Jane' })
    expect(values.find((v) => v.name === 'FirstName')?.value).toBe('Jane')
  })

  it('maps email → Email field', () => {
    const values = untransformContact({ email: 'jane@example.com' })
    expect(values.find((v) => v.name === 'Email')?.value).toBe('jane@example.com')
  })

  it('maps address subfields', () => {
    const values = untransformContact({
      address: {
        line1: '1 Main St',
        city: 'Springfield',
        region: 'IL',
        postalCode: '62701',
        country: 'US',
      },
    })
    expect(values.find((v) => v.name === 'MailingStreet')?.value).toBe('1 Main St')
    expect(values.find((v) => v.name === 'MailingCity')?.value).toBe('Springfield')
  })

  it('skips nullish fields', () => {
    const values = untransformContact({ first_name: undefined, last_name: undefined })
    expect(values).toHaveLength(0)
  })

  it('round-trips first_name and email', () => {
    const raw = makeRaw({
      values: [
        { name: 'FirstName', value: 'Jane' },
        { name: 'Email', value: 'jane@example.com' },
      ],
    })
    const contact = transformContact(raw)
    const back = untransformContact(contact)
    expect(back.find((v) => v.name === 'FirstName')?.value).toBe('Jane')
    expect(back.find((v) => v.name === 'Email')?.value).toBe('jane@example.com')
  })
})
