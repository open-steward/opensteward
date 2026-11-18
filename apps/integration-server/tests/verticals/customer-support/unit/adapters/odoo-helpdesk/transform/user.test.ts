/** res.users rows; fields from odoo/addons/base/models/res_users.py, 14.0 and 19.0. */
import { describe, expect, it } from 'vitest'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema'
import { transformUser } from '../../../../../../../src/verticals/customer-support/adapters/odoo-helpdesk/transform/user'

describe('odoo-helpdesk transformUser', () => {
  it('maps an internal user', () => {
    const u = UserSchema.parse(
      transformUser({
        id: 2,
        name: 'Mitchell Admin',
        email: 'admin@example.com',
        share: false,
        active: true,
      }),
    )
    expect(u).toMatchObject({
      id: '2',
      externalId: '2',
      name: 'Mitchell Admin',
      email: 'admin@example.com',
      teamIds: [],
      platform: 'odoo-helpdesk',
    })
    expect(u.role).toBeUndefined()
    expect(u.metadata).toEqual({ active: 'true' })
  })

  it('tolerates every optional field missing', () => {
    const u = UserSchema.parse(transformUser({ id: 6, email: false }))
    expect(u).toMatchObject({ id: '6', name: '', teamIds: [] })
    expect(u.email).toBeUndefined()
    expect(u.metadata).toEqual({})
  })
})
