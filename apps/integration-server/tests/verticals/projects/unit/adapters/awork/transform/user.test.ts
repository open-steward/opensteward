import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawAworkUser,
} from '../../../../../../../src/verticals/projects/adapters/awork/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('awork transformUser', () => {
  const raw: RawAworkUser = {
    id: 'usr-awork-5',
    firstName: 'Grace',
    lastName: 'Hopper',
    userContactInfos: [
      { type: 'email', subType: 'work', value: 'grace@acme.example' },
      { type: 'phone', value: '+15550001234' },
    ],
    status: { invitationAccepted: true, isDeactivated: false },
    isDeactivated: false,
    createdOn: '2024-01-01T00:00:00Z',
  }

  it('maps id and externalId', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('usr-awork-5')
    expect(result.externalId).toBe('usr-awork-5')
  })

  it('name is firstName + lastName', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Grace Hopper')
  })

  it('email is extracted from userContactInfos where type=email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('grace@acme.example')
  })

  it('email is undefined when no email contact info entry', () => {
    const result = transformUser({ ...raw, userContactInfos: [{ type: 'phone', value: '+1555' }] })
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds is empty when no workspaceId arg given', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('workspaceIds contains caller-supplied workspaceId', () => {
    const result = transformUser(raw, 'ws-awork')
    expect(result.workspaceIds).toEqual(['ws-awork'])
  })

  it('platform is awork', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('awork')
  })

  it('metadata.isDeactivated reflects status.isDeactivated', () => {
    const result = transformUser(raw)
    expect(result.metadata.isDeactivated).toBe('false')
  })

  it('metadata.invitationAccepted reflects status.invitationAccepted', () => {
    const result = transformUser(raw)
    expect(result.metadata.invitationAccepted).toBe('true')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('name is empty string when firstName and lastName are absent', () => {
    const result = transformUser({ id: 'u1' })
    expect(result.name).toBe('')
  })
})
