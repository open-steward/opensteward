/**
 * Fixture: one PersonResource as krayin/rest-api emits it
 * (src/Http/Resources/V1/Contact/PersonResource.php), with the documented
 * example values of src/Docs/Models/Contact/Person.php.
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  type RawKrayinContact,
} from '../../../../../../../src/verticals/crm/adapters/krayin-crm/transform/contact'

function doc(): RawKrayinContact {
  return {
    id: 1,
    name: 'John Doe',
    emails: [
      { label: 'work', value: 'example1@gmail.com' },
      { label: 'home', value: 'example2@gmail.com' },
    ],
    contact_numbers: [{ label: 'work', value: '9999999999' }],
    organization: { id: 1, name: 'Organization Name' },
    job_title: 'CEO',
    sales_owner: { id: 3, name: 'Admin' },
    created_at: '2020-01-27 17:50:45',
    updated_at: '2020-01-27 17:50:45',
  }
}

describe('krayin-crm transformContact', () => {
  it('maps the documented resource and satisfies the canonical schema', () => {
    const out = ContactSchema.parse(transformContact(doc()))
    expect(out).toMatchObject({
      id: '1',
      name: 'John Doe',
      email: 'example1@gmail.com',
      phone: '9999999999',
      title: 'CEO',
      company_id: '1',
      owner_id: '3',
      created_at: '2020-01-27T17:50:45.000Z',
    })
  })

  it('invents no first/last name split', () => {
    const out = transformContact(doc())
    expect(out.first_name).toBeUndefined()
    expect(out.last_name).toBeUndefined()
  })

  it('omits organization and sales_owner when the resource leaves them out', () => {
    const raw = doc()
    delete raw.organization
    delete raw.sales_owner
    const out = ContactSchema.parse(transformContact(raw))
    expect(out.company_id).toBeUndefined()
    expect(out.owner_id).toBeUndefined()
  })

  it('drops an email the canonical schema would reject', () => {
    const out = ContactSchema.parse(
      transformContact({ ...doc(), emails: [{ label: 'work', value: 'nope' }] }),
    )
    expect(out.email).toBeUndefined()
  })

  it('throws instead of inventing a missing id', () => {
    expect(() => transformContact({ ...doc(), id: undefined })).toThrow(/no id/)
  })
})
