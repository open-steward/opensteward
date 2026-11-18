import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawOlarkOperator,
} from '../../../../../../../src/verticals/customer-support/adapters/olark/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

describe('olark transformUser', () => {
  const raw: RawOlarkOperator = {
    id: 'op-olark-42',
    username: 'olivia.chat',
    nickname: 'Olivia',
    emailAddress: 'olivia@company.example',
    group_ids: ['grp-1', 'grp-2'],
    available: true,
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('op-olark-42')
    expect(result.externalId).toBe('op-olark-42')
  })

  it('maps emailAddress to email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('olivia@company.example')
  })

  it('uses nickname as name when present', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Olivia')
  })

  it('falls back to username when nickname is absent', () => {
    const noNick: RawOlarkOperator = { ...raw, nickname: undefined }
    const result = transformUser(noNick)
    expect(result.name).toBe('olivia.chat')
  })

  it('role is always agent', () => {
    const result = transformUser(raw)
    expect(result.role).toBe('agent')
  })

  it('maps group_ids to teamIds', () => {
    const result = transformUser(raw)
    expect(result.teamIds).toEqual(['grp-1', 'grp-2'])
  })

  it('places username in metadata', () => {
    const result = transformUser(raw)
    expect(result.metadata['username']).toBe('olivia.chat')
  })

  it('places available in metadata', () => {
    const result = transformUser(raw)
    expect(result.metadata['available']).toBe('true')
  })

  it('sets platform to olark', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('olark')
  })

  it('produces a UserSchema-valid result', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('teamIds is empty array when group_ids is undefined', () => {
    const noGroups: RawOlarkOperator = { ...raw, group_ids: undefined }
    const result = transformUser(noGroups)
    expect(result.teamIds).toEqual([])
  })

  it('handles absent emailAddress — email is undefined', () => {
    const noEmail: RawOlarkOperator = { ...raw, emailAddress: undefined }
    const result = transformUser(noEmail)
    expect(result.email).toBeUndefined()
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
