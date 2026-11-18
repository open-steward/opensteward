/**
 * Fixture: the documented ContactResponseModel of the Desk365 v3 spec
 * (https://apps.desk365.io/apis/v3/api-docs?group=v3), using its own example
 * values. GET /v3/contacts returns `{ count, content: ContactResponseModel[] }`
 * and GET /v3/contacts/details returns one ContactResponseModel.
 */
import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawDesk365Contact,
} from '../../../../../../../src/verticals/customer-support/adapters/deskcom-desk365/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('deskcom-desk365 transformContact', () => {
  const raw: RawDesk365Contact = {
    name: 'Joe',
    primary_email: 'contact@contoso.com',
    is_deleted: 0,
    secondary_emails: 'joe@contoso.com',
    title: 'Manager',
    // The spec's example uses '123456789' for both; mobile is given a distinct
    // value here so a phone-reads-mobile regression is visible.
    mobile: '987654321',
    phone: '123456789',
    company_name: 'Contoso',
    primary_department: 'Developers',
    secondary_departments: 'Sales, Marketing',
    created_on: '2023-01-01 23:00:00',
    updated_on: '2023-01-01 23:00:00',
    custom_fields: { cf_dob: 'string', cf_employee_id: 0 },
  }

  it('parses against the canonical ContactSchema', () => {
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })

  it('keys the contact by primary_email, the key GET /v3/contacts/details looks it up by', () => {
    const out = transformContact(raw)
    expect(out.id).toBe('contact@contoso.com')
    expect(out.externalId).toBe('contact@contoso.com')
    expect(out.email).toBe('contact@contoso.com')
  })

  it('maps name, phone and company_name', () => {
    const out = transformContact(raw)
    expect(out.name).toBe('Joe')
    expect(out.phone).toBe('123456789')
    expect(out.organizationId).toBe('Contoso')
    expect(out.platform).toBe('deskcom-desk365')
  })

  it('keeps title, primary department and is_deleted as metadata, and no mobile number', () => {
    const out = transformContact(raw)
    expect(out.metadata).toEqual({
      title: 'Manager',
      primaryDepartment: 'Developers',
      isDeleted: '0',
    })
    expect(out.phone).not.toBe('987654321')
    expect(JSON.stringify(out)).not.toContain('"phone":"987654321"')
    expect(JSON.stringify(out.metadata)).not.toContain('987654321')
  })

  it('surfaces a deleted contact through metadata.isDeleted', () => {
    expect(transformContact({ ...raw, is_deleted: 1 }).metadata.isDeleted).toBe('1')
  })

  it('reads phone only from phone, never from mobile', () => {
    const { phone: _p, ...noPhone } = raw
    expect(transformContact(noPhone).phone).toBeUndefined()
  })

  it('throws when primary_email, the only documented contact key, is missing', () => {
    const { primary_email: _drop, ...rest } = raw
    expect(() => transformContact(rest)).toThrow(/primary_email/)
  })

  it('omits optional fields the record lacks', () => {
    const out = transformContact({ name: 'Joe', primary_email: 'contact@contoso.com' })
    expect(out.phone).toBeUndefined()
    expect(out.organizationId).toBeUndefined()
    expect(out.metadata).toEqual({})
    expect(() => ContactSchema.parse(out)).not.toThrow()
  })
})
