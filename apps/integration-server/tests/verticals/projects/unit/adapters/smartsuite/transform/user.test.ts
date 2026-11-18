/**
 * The fixture is the member object in the documented List Members example
 * response, trimmed: every field the transform reads (id, full_name.sys_root,
 * email, role, type, status.value) is copied verbatim, and unread fields such
 * as office_location, skills, social links, profile_image and phone are left
 * out:
 * https://developers.smartsuite.com/docs/org_management/members/list-members
 */
import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawSmartsuiteMember,
} from '../../../../../../../src/verticals/projects/adapters/smartsuite/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

const DOC_EXAMPLE: RawSmartsuiteMember = {
  application_id: '63a1f65723aaf6bcb564b1f0',
  availability_status: {
    emoji: '',
    status: '',
    selected_interval: '',
    clear_after: { date: null, include_time: false },
  },
  comments_count: 0,
  first_created: { on: '2022-12-20T17:52:23.867000Z', by: '63a1f65723aaf6bcb564b1f1' },
  last_updated: { by: '63a1f65723aaf6bcb564b1f1', on: '2023-05-01T21:44:32.557000Z' },
  deleted_date: { date: null, include_time: false },
  ranking: { default: 'aagckvjtea' },
  full_name: {
    title: '',
    first_name: 'Jane',
    middle_name: '',
    last_name: 'Doe',
    sys_root: 'Jane Doe',
  },
  company_name: 'SmartSuite',
  department: 'Executive Team',
  about_me: 'Jane leads the engineering team.',
  job_title: 'Co-Founder / CTO',
  email: ['jane.doe@example.com'],
  type: '1',
  role: '1',
  locale: 'en-US',
  timezone: 'America/Chicago',
  language: 'en',
  teams: ['63a1f65b23aaf6bcb564b1fd', '63d1a954195ca92df675e5c9'],
  last_login: { date: '2023-05-30T22:47:38.837000Z', include_time: true, _cls: 'DateDocument' },
  id: '63a1f65723aaf6bcb564b1f1',
  application_slug: 'members',
  status: { value: '1', updated_on: '2022-12-20T17:52:24.804000Z' },
}

describe('smartsuite transformUser', () => {
  it('parses the documented example with UserSchema', () => {
    const result = UserSchema.parse(transformUser(DOC_EXAMPLE, 'ws1'))
    expect(result).toMatchObject({
      id: '63a1f65723aaf6bcb564b1f1',
      externalId: '63a1f65723aaf6bcb564b1f1',
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      workspaceIds: ['ws1'],
      platform: 'smartsuite',
    })
  })

  it('keeps the documented numeric-string role, type and status in metadata', () => {
    expect(transformUser(DOC_EXAMPLE, 'ws1').metadata).toEqual({
      role: '1',
      type: '1',
      status: '1',
    })
  })

  it('reads the name from full_name.sys_root', () => {
    const r = transformUser(
      { ...DOC_EXAMPLE, full_name: { first_name: 'A', last_name: 'B', sys_root: 'A B' } },
      'ws1',
    )
    expect(r.name).toBe('A B')
  })

  // "Returned records do not include any fields with "empty" values, e.g. "",
  // [], or false." An absent name is an empty one, and an absent email list
  // means no email.
  it('reads an omitted (empty) name as "" and an omitted email list as no email', () => {
    const { full_name: _n, email: _e, ...bare } = DOC_EXAMPLE
    const r = UserSchema.parse(transformUser(bare as RawSmartsuiteMember, 'ws1'))
    expect(r.name).toBe('')
    expect(r.email).toBeUndefined()
  })

  it('takes the first documented email', () => {
    const r = transformUser({ ...DOC_EXAMPLE, email: ['a@example.com', 'b@example.com'] }, 'ws1')
    expect(r.email).toBe('a@example.com')
  })

  it('throws on a member without an id', () => {
    const { id: _id, ...noId } = DOC_EXAMPLE
    expect(() => transformUser(noId as RawSmartsuiteMember, 'ws1')).toThrow(/id/)
  })
})
