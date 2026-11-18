/** res.partner rows; fields from odoo/addons/base/models/res_partner.py, 14.0 and 19.0. */
import { describe, expect, it } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema'
import { transformContact } from '../../../../../../../src/verticals/customer-support/adapters/odoo-helpdesk/transform/contact'

describe('odoo-helpdesk transformContact', () => {
  it('maps a person at a company', () => {
    const c = ContactSchema.parse(
      transformContact({
        id: 17,
        name: 'May J. Cooper',
        email: 'may@example.com',
        phone: '+32 2 555 0100',
        is_company: false,
        commercial_partner_id: [9, 'Azure Interior'],
      }),
    )
    expect(c).toMatchObject({
      id: '17',
      externalId: '17',
      name: 'May J. Cooper',
      email: 'may@example.com',
      phone: '+32 2 555 0100',
      organizationId: '9',
      platform: 'odoo-helpdesk',
    })
    expect(c.metadata).toEqual({ isCompany: 'false' })
  })

  it('a partner that is its own commercial entity has no organization', () => {
    const c = ContactSchema.parse(
      transformContact({
        id: 9,
        name: 'Azure Interior',
        is_company: true,
        commercial_partner_id: [9, 'Azure Interior'],
      }),
    )
    expect(c.organizationId).toBeUndefined()
    expect(c.metadata).toEqual({ isCompany: 'true' })
  })

  it('drops an email field that is not one address', () => {
    const c = ContactSchema.parse(
      transformContact({ id: 4, name: 'Two', email: 'a@example.com, b@example.com' }),
    )
    expect(c.email).toBeUndefined()
  })

  it('tolerates every optional field missing', () => {
    const c = ContactSchema.parse(transformContact({ id: 5 }))
    expect(c).toMatchObject({ id: '5', name: '' })
    expect(c.email).toBeUndefined()
    expect(c.phone).toBeUndefined()
    expect(c.metadata).toEqual({})
  })
})
