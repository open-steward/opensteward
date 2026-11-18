/**
 * Fixture: the documented user-export-data row
 * (https://developers.faveohelpdesk.com/get-users-list/).
 */
import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawFaveoUserRow,
} from '../../../../../../../src/verticals/customer-support/adapters/faveo-helpdesk/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

const documented: RawFaveoUserRow = {
  user_name: '<a href="http://localhost:8000/user/4">alan@gmail.com</a>',
  email: 'alan@gmail.com',
  id: 4,
  first_name: 'Alan',
  last_name: 'Walker',
  country_code: '+91',
  mobile: '9876543210',
  name: "<a href='http://localhost:8000/user/4\"'>Alan Walker</a>",
  organizations: '--',
  roles: 'User, Organization User',
  view_url: '/user/4',
  edit_url: '/user/4/edit',
  full_name: 'Alan Walker',
  meta_name: 'Alan Walker <alan@gmail.com>',
  email_verified: true,
  mobile_verified: true,
}

describe('faveo-helpdesk transformContact', () => {
  it('maps the documented row onto the canonical schema', () => {
    const c = ContactSchema.parse(transformContact(documented))
    expect(c).toMatchObject({
      id: '4',
      externalId: '4',
      email: 'alan@gmail.com',
      name: 'Alan Walker',
      phone: '9876543210',
      platform: 'faveo-helpdesk',
      metadata: { roles: 'User, Organization User', countryCode: '+91' },
    })
    expect(c.organizationId).toBeUndefined()
  })

  it('takes the name from full_name, never the HTML name/user_name links', () => {
    expect(transformContact(documented).name).not.toContain('<a')
  })

  it('omits an email that is not an address', () => {
    const c = ContactSchema.parse(transformContact({ ...documented, email: 'Not available' }))
    expect(c.email).toBeUndefined()
  })

  it('omits phone when mobile is empty', () => {
    expect(transformContact({ ...documented, mobile: '' }).phone).toBeUndefined()
  })

  it('throws when full_name is missing rather than inventing a name', () => {
    const { full_name: _drop, ...rest } = documented
    expect(() => transformContact(rest as RawFaveoUserRow)).toThrow(/full_name/)
  })
})
