import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawPlaneMember,
} from '../../../../../../../src/verticals/projects/adapters/plane/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('plane transformUser', () => {
  const raw: RawPlaneMember = {
    id: 'membership-uuid-001',
    role: 15,
    member: {
      id: 'user-uuid-001',
      display_name: 'Jane Doe',
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane.doe@acme.example',
      avatar: 'https://cdn.example.com/avatars/jane.png',
    },
  }

  it('id comes from member.id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('user-uuid-001')
  })

  it('externalId comes from member.id', () => {
    const result = transformUser(raw)
    expect(result.externalId).toBe('user-uuid-001')
  })

  it('id falls back to raw.id when member is absent', () => {
    const result = transformUser({ id: 'membership-uuid-002', role: 5 } as any)
    expect(result.id).toBe('membership-uuid-002')
    expect(result.externalId).toBe('membership-uuid-002')
  })

  it('name uses display_name when present', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('name falls back to first_name + last_name when display_name is absent', () => {
    const result = transformUser({
      ...raw,
      member: { ...raw.member!, display_name: undefined },
    } as any)
    expect(result.name).toBe('Jane Doe')
  })

  it('name falls back to first_name alone when last_name is absent', () => {
    const result = transformUser({
      ...raw,
      member: { ...raw.member!, display_name: undefined, last_name: undefined },
    } as any)
    expect(result.name).toBe('Jane')
  })

  it('name falls back to memberId when display_name and name parts are absent', () => {
    const result = transformUser({
      ...raw,
      member: { id: 'user-uuid-001' },
    } as any)
    expect(result.name).toBe('user-uuid-001')
  })

  it('email maps from member.email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('email is undefined when member.email is absent', () => {
    const result = transformUser({
      ...raw,
      member: { ...raw.member!, email: undefined },
    } as any)
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds is empty when workspaceSlug is not given', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('workspaceIds contains workspaceSlug when provided', () => {
    const result = transformUser(raw, 'acme-workspace')
    expect(result.workspaceIds).toEqual(['acme-workspace'])
  })

  it('metadata.membershipId maps from raw.id (the membership wrapper id)', () => {
    const result = transformUser(raw)
    expect(result.metadata['membershipId']).toBe('membership-uuid-001')
  })

  it('metadata.role maps from raw.role as string', () => {
    const result = transformUser(raw)
    expect(result.metadata['role']).toBe('15')
  })

  it('metadata.avatarUrl maps from member.avatar', () => {
    const result = transformUser(raw)
    expect(result.metadata['avatarUrl']).toBe('https://cdn.example.com/avatars/jane.png')
  })

  it('metadata.avatarUrl is absent when avatar is null', () => {
    const result = transformUser({
      ...raw,
      member: { ...raw.member!, avatar: null },
    } as any)
    expect(result.metadata['avatarUrl']).toBeUndefined()
  })

  it('platform is plane', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('plane')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'acme-workspace')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('passes UserSchema.parse with no member sub-object', () => {
    const result = transformUser({ id: 'membership-uuid-003', role: 10 } as any)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
