/** res.users rows; fields from odoo/addons/base/models/res_users.py, 19.0 and 14.0. */
import { describe, expect, it } from 'vitest'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'
import { transformUser } from '../../../../../../../src/verticals/projects/adapters/odoo-project/transform/user'

describe('odoo-project transformUser', () => {
  it('maps an internal user', () => {
    const u = UserSchema.parse(
      transformUser({
        id: 2,
        name: 'Mitchell Admin',
        email: 'admin@yourcompany.example.com',
        active: true,
        share: false,
        company_ids: [1, 2],
      }),
    )
    expect(u).toMatchObject({
      id: '2',
      externalId: '2',
      email: 'admin@yourcompany.example.com',
      name: 'Mitchell Admin',
      workspaceIds: ['1', '2'],
      platform: 'odoo-project',
    })
    expect(u.metadata).toEqual({ active: 'true', share: 'false' })
  })

  it('drops an email that is not an address instead of failing the row', () => {
    const u = UserSchema.parse(transformUser({ id: 6, name: 'Bot', email: 'not an email' }))
    expect(u.email).toBeUndefined()
    expect(UserSchema.parse(transformUser({ id: 7, email: false })).email).toBeUndefined()
  })

  it('a row with only an id still parses', () => {
    expect(UserSchema.parse(transformUser({ id: 8 }))).toMatchObject({
      id: '8',
      name: '',
      workspaceIds: [],
    })
  })
})
