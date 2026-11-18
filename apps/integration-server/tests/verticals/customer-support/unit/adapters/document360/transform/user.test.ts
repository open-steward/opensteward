/**
 * Fixtures are the documented examples in
 * https://apihub.document360.io/swagger/v2/swagger.json:
 *   - GET /v2/Teams, example "Mixed team — owner, editor, draft writer" (`result[]`
 *     of TeamAccountSummaryCustomer)
 *   - GET /v2/Teams/{userId}, example "Teams - Success status Response" (`result`
 *     of CompleteUserInfoCustomer, where `portal_role` is an object)
 */
import { describe, it, expect } from 'vitest'
import {
  transformUser,
  transformUserDetail,
  type RawDocument360TeamMember,
  type RawDocument360TeamMemberDetail,
} from '../../../../../../../src/verticals/customer-support/adapters/document360/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

const LOGO =
  'https://www.gravatar.com/avatar/FE29D578CBEC3945FC88BF4F10906A3E?sv=2022-11-02&st=2024-06-18T07%3A12%3A34Z&se=2024-06-18T07%3A32%3A34Z&sr=b&sp=r&sig=LEA2ccLr1hMTZkAE48jsdaTYgRr6jNScPQ4x4E3vTss%3D'

describe('document360 transformUser (GET /v2/Teams row)', () => {
  const raw: RawDocument360TeamMember = {
    user_id: 'a7f2c5e1-8d4b-4cba-9f10-2b3c4d5e6f70',
    first_name: 'Anita',
    last_name: 'Rao',
    email_id: 'anita.rao@example.com',
    profile_logo_url: LOGO,
    portal_role: 'Editor',
    last_login_at: '2026-05-17T16:05:00Z',
  }

  it('parses as a canonical User', () => {
    const u = UserSchema.parse(transformUser(raw))
    expect(u).toMatchObject({
      id: 'a7f2c5e1-8d4b-4cba-9f10-2b3c4d5e6f70',
      externalId: 'a7f2c5e1-8d4b-4cba-9f10-2b3c4d5e6f70',
      email: 'anita.rao@example.com',
      name: 'Anita Rao',
      role: 'Editor',
      teamIds: [],
      platform: 'document360',
    })
    expect(u.metadata['profileLogoUrl']).toBe(LOGO)
  })

  it('a documented null last_login_at and missing names still parse', () => {
    const u = UserSchema.parse(
      transformUser({ user_id: 'c8d9e0f1', email_id: null, last_login_at: null }),
    )
    expect(u.name).toBe('')
    expect(u.email).toBeUndefined()
  })

  it('throws on a row without user_id instead of inventing an id', () => {
    expect(() => transformUser({ user_id: null, first_name: 'x' })).toThrow(/user_id/)
  })
})

describe('document360 transformUserDetail (GET /v2/Teams/{userId} result)', () => {
  const raw: RawDocument360TeamMemberDetail = {
    user_id: 'f11efc6f-e968-4e95-82eb-85ad61559de8',
    first_name: 'peter',
    last_name: 'jone',
    email_id: 'peterjone@mail.com',
    profile_logo_url: LOGO,
    last_login_at: '2024-06-13T14:30:00',
    portal_role: { role_id: 'c1b8ae08-78d5-41d9-b3c4-3b0892b05ca8', role_name: ' Owner' },
    content_roles: [
      {
        version_access: null,
        language_access: null,
        category_access: null,
        article_access: null,
        access_scope_level: 3,
        role_id: '62810dc1-2d21-422e-bdfb-c3daebf91dd3',
        role_name: 'Editor',
      },
    ],
    associated_groups: [
      {
        id: 'c08e52df-1de9-44e7-8c02-be0e41826c24',
        title: 'MyGroupName',
        description: 'This is my group description.',
        content_role_infos: null,
      },
    ],
  }

  it('reads the role from portal_role.role_name and parses as a User', () => {
    const u = UserSchema.parse(transformUserDetail(raw))
    expect(u).toMatchObject({
      id: 'f11efc6f-e968-4e95-82eb-85ad61559de8',
      email: 'peterjone@mail.com',
      name: 'peter jone',
      role: ' Owner',
      platform: 'document360',
    })
  })

  it('throws without user_id', () => {
    expect(() => transformUserDetail({ ...raw, user_id: null })).toThrow(/user_id/)
  })
})
