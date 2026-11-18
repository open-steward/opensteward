/**
 * Fixture: the documented example of GET https://api.tapd.cn/workspaces/users
 * https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/workspace/users.html
 * Items are wrapped as { "UserWorkspace": { "user": "wiki", "role_id": [...] } }.
 * Fields: user 成员昵称, role_id 用户组ID, email 成员邮箱号, name 真实姓名,
 * real_join_time 加入项目（公司）时间.
 */
import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawTapdUser,
} from '../../../../../../../src/verticals/projects/adapters/tapd/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

/** Verbatim documented item. */
const DOC_MEMBER: RawTapdUser = { user: 'wiki', role_id: ['1000000000000000002'] }

/** The same member with the documented `fields` columns name and email. */
const WITH_FIELDS: RawTapdUser = {
  ...DOC_MEMBER,
  name: 'Wiki Li',
  email: 'wiki@example.com',
  real_join_time: '2020-01-02 03:04:05',
}

describe('tapd transformUser (documented /workspaces/users UserWorkspace item)', () => {
  it('parses the verbatim documented item with UserSchema', () => {
    const u = UserSchema.parse(transformUser(DOC_MEMBER, '20003271'))
    expect(u).toEqual({
      // Scoped so getUser can send the required workspace_id.
      id: '20003271:wiki',
      externalId: 'wiki',
      name: 'wiki',
      workspaceIds: ['20003271'],
      platform: 'tapd',
      metadata: { nick: 'wiki', roleIds: '1000000000000000002' },
      raw: DOC_MEMBER,
    })
    expect(u.email).toBeUndefined()
  })

  it('maps the documented name, email and real_join_time', () => {
    const u = UserSchema.parse(transformUser(WITH_FIELDS, '20003271'))
    expect(u.name).toBe('Wiki Li')
    expect(u.email).toBe('wiki@example.com')
    expect(u.metadata).toEqual({
      nick: 'wiki',
      roleIds: '1000000000000000002',
      joinedAt: '2020-01-02T03:04:05.000Z',
    })
  })

  it('omits an empty email instead of failing the email schema', () => {
    const u = UserSchema.parse(transformUser({ ...WITH_FIELDS, email: '' }, '20003271'))
    expect(u.email).toBeUndefined()
  })

  it('throws when the documented user nickname is missing', () => {
    expect(() => transformUser({ role_id: [] } as unknown as RawTapdUser, '20003271')).toThrow(
      /user/,
    )
  })
})
