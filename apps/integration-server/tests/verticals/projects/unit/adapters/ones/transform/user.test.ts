import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawOnesUser,
} from '../../../../../../../src/verticals/projects/adapters/ones/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('ones transformUser', () => {
  // The documented example row of GET /account/users/search
  // (https://docs.ones.com/developer/openapi/api/01-get-team-user-search-list/).
  const raw: RawOnesUser = {
    id: '2oF4mAeA',
    email: 'blue@ones.cn',
    name: 'blue',
    phone: '+860000000000',
    avatar: '/api/project/file/avatar/Fu-Dl5d3F0EUZOe1UUxU1EEsL2Dv',
    organization: 'ONES',
    staffID: '000001',
    position: 'Software Engineer',
    status: 'normal',
  }

  it('maps id and name', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('2oF4mAeA')
    expect(result.name).toBe('blue')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('blue@ones.cn')
  })

  it('maps workspaceId when provided', () => {
    const result = transformUser(raw, 'ws_x')
    expect(result.workspaceIds).toEqual(['ws_x'])
  })

  it('workspaceIds is empty when not provided', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('metadata includes staffId and position', () => {
    const result = transformUser(raw)
    expect(result.metadata.staffId).toBe('000001')
    expect(result.metadata.position).toBe('Software Engineer')
  })

  it('metadata includes status', () => {
    const result = transformUser(raw)
    expect(result.metadata.status).toBe('normal')
  })

  it('platform is ones', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('ones')
  })

  it('throws when the documented id is absent instead of inventing one', () => {
    expect(() => transformUser({ name: 'x' })).toThrow(/id/)
  })

  it('keeps phone out of the mapped metadata (it stays only in raw)', () => {
    const result = transformUser(raw)
    expect(JSON.stringify(result.metadata)).not.toContain('+860000000000')
  })

  it('throws when the documented name is absent instead of inventing an empty one', () => {
    expect(() => transformUser({ id: '2oF4mAeA' })).toThrow(/name/)
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'ws_x')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
