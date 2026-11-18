/**
 * Fixtures are the GET /api/v1/agents/{agent_id} and GET /api/v1/agents
 * response examples (https://desk.zoho.com/DeskAPIDocument, Agents).
 */
import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawZohoDeskAgent,
} from '../../../../../../../src/verticals/customer-support/adapters/zoho-desk/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema'

const LIST_AGENT: RawZohoDeskAgent = {
  lastName: 'case',
  roleId: '1892000000056099',
  emailId: 'case@zylker.com',
  associatedDepartmentIds: ['1892000000006907', '1892000000082069', '1892000000639717'],
  firstName: 'zyl',
  name: 'zyl case',
  rolePermissionType: 'Admin',
  isConfirmed: true,
  id: '1892000000056007',
  status: 'ACTIVE',
}

describe('transformUser', () => {
  it('maps the documented list-agents example', () => {
    const u = UserSchema.parse(transformUser(LIST_AGENT))
    expect(u).toMatchObject({
      id: '1892000000056007',
      externalId: '1892000000056007',
      email: 'case@zylker.com',
      name: 'zyl case',
      role: 'Admin',
      teamIds: [],
      platform: 'zoho-desk',
    })
    expect(u.metadata).toEqual({
      status: 'ACTIVE',
      departmentIds: '1892000000006907,1892000000082069,1892000000639717',
    })
  })

  it('builds a name from first and last name when name is empty', () => {
    const u = UserSchema.parse(
      transformUser({
        id: '1',
        name: '',
        firstName: 'Steve',
        lastName: 'Waugh',
        emailId: 'stephen@zylker.com',
        status: 'DISABLED',
      }),
    )
    expect(u.name).toBe('Steve Waugh')
  })

  it('survives a bare row', () => {
    expect(UserSchema.parse(transformUser({ id: 3 }))).toMatchObject({
      id: '3',
      name: '',
      teamIds: [],
    })
  })
})
