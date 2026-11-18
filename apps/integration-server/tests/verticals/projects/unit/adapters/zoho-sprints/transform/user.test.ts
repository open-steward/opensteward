/**
 * Zoho Sprints "Get workspace users" (GET /team/{teamId}/users/) returns
 * users as positional arrays: `userIds` orders the page, `userJObj` maps each
 * id to an array, and `user_prop` names each array position.
 *
 * Fixture: the documented example response from https://sprints.zoho.com/apidoc.html
 * (Users → Get workspace users), with the doc's masked names and emails
 * (e.g. "J**n M***h", "j***m@z****r.com") replaced by unmasked values. The
 * verbatim masked emails are also tested: they are not valid addresses.
 */
import { describe, it, expect } from 'vitest'
import {
  transformUser,
  transformUsersPage,
  type ZohoSprintsUsersPage,
} from '../../../../../../../src/verticals/projects/adapters/zoho-sprints/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

const USER_PROP = {
  iamUserId: 3,
  userStatus: 4,
  displayName: 0,
  roleId: 6,
  emailId: 1,
  addedVia: 5,
  lastAccessedTime: 14,
  licenseType: 12,
  mappingEntity: 16,
  integrationUserType: 10,
  companyId: 13,
  hasPerm_viewuserdet: 8,
  profileId: 7,
  createdTime: 15,
  isConfirmed: 2,
  userType: 11,
  integObj: 9,
}

const DOC_EXAMPLE: ZohoSprintsUsersPage = {
  userJObj: {
    '2000000007241': [
      'John Smith',
      'john.smith@zylker.com',
      true,
      '22572213',
      1,
      0,
      '2000000000095',
      '2000000007237',
      true,
      { ZOHO_PROJECTS_USERS: false },
      0,
      1,
      1,
      '-1',
      '',
      '2024-05-21T13:42:05.717Z',
      0,
    ],
    '2000000000005': [
      'Helen Collins',
      'helen.c@zylker.com',
      true,
      '22572585',
      1,
      0,
      '2000000000091',
      '2000000000013',
      true,
      { ZOHO_PROJECTS_USERS: false },
      0,
      1,
      1,
      '-1',
      '',
      '2024-05-21T07:59:20.582Z',
      0,
    ],
  },
  next: false,
  userIds: ['2000000000005', '2000000007241'],
  user_prop: USER_PROP,
  status: 'success',
}

describe('zoho-sprints transformUsersPage (documented userIds/userJObj/user_prop)', () => {
  it('returns one user per userIds entry, in userIds order, each parsing as UserSchema', () => {
    const users = transformUsersPage(DOC_EXAMPLE, 'team-9')
    expect(users.map((u) => u.id)).toEqual(['2000000000005', '2000000007241'])
    for (const u of users) expect(UserSchema.parse(u)).toEqual(u)
  })

  it('reads displayName and emailId at the positions user_prop names', () => {
    const [helen, john] = transformUsersPage(DOC_EXAMPLE, 'team-9')
    expect(helen).toMatchObject({
      id: '2000000000005',
      externalId: '2000000000005',
      name: 'Helen Collins',
      email: 'helen.c@zylker.com',
      workspaceIds: ['team-9'],
      platform: 'zoho-sprints',
    })
    expect(john?.name).toBe('John Smith')
    expect(john?.email).toBe('john.smith@zylker.com')
  })

  it('follows user_prop rather than fixed positions', () => {
    const [u] = transformUsersPage(
      {
        userIds: ['1'],
        userJObj: { '1': ['a@zylker.com', 'Ann'] },
        user_prop: { displayName: 1, emailId: 0 },
      },
      'team-9',
    )
    expect(u).toMatchObject({ name: 'Ann', email: 'a@zylker.com' })
  })

  it('metadata carries the documented roleId, profileId, userStatus and userType', () => {
    const [helen] = transformUsersPage(DOC_EXAMPLE, 'team-9')
    expect(helen?.metadata).toEqual({
      roleId: '2000000000091',
      profileId: '2000000000013',
      userStatus: '1',
      userType: '1',
    })
  })

  it('an empty page yields no users', () => {
    expect(
      transformUsersPage({ userIds: [], userJObj: {}, user_prop: USER_PROP, next: false }, 't'),
    ).toEqual([])
  })

  it('omits an email that is not a valid address (the doc example masks them)', () => {
    const u = transformUser(
      '2000000000005',
      ['H***n C*****s', 'h*****c@z****r.com'],
      USER_PROP,
      't',
    )
    expect(u.email).toBeUndefined()
    expect(UserSchema.parse(u).name).toBe('H***n C*****s')
  })

  it('throws when a userIds entry has no userJObj row', () => {
    expect(() =>
      transformUsersPage({ userIds: ['9'], userJObj: {}, user_prop: USER_PROP }, 't'),
    ).toThrow(/9/)
  })

  it('throws when the row has no displayName string', () => {
    expect(() => transformUser('9', [null, 'x@zylker.com'], USER_PROP, 't')).toThrow(/displayName/)
  })
})
