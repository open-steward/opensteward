import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawKantataUser,
} from '../../../../../../../src/verticals/projects/adapters/kantata/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('kantata transformUser', () => {
  const raw: RawKantataUser = {
    id: 'usr-7',
    full_name: 'Jane Doe',
    email_address: 'jane.doe@example.com',
    headline: 'Senior Designer',
    photo_path: '/photos/jane.jpg',
    account_membership_id: 'mem-42',
  }

  it('maps id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('usr-7')
    expect(result.externalId).toBe('usr-7')
  })

  it('maps full_name to name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email_address to email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('workspaceIds includes provided workspaceId', () => {
    const result = transformUser(raw, 'ws-123')
    expect(result.workspaceIds).toEqual(['ws-123'])
  })

  it('workspaceIds is empty when no workspaceId provided', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is kantata', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('kantata')
  })

  it('metadata contains headline and accountMembershipId', () => {
    const result = transformUser(raw)
    expect(result.metadata.headline).toBe('Senior Designer')
    expect(result.metadata.accountMembershipId).toBe('mem-42')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('name defaults to empty string when full_name absent', () => {
    const result = transformUser({ id: 'u1' })
    expect(result.name).toBe('')
  })
})
