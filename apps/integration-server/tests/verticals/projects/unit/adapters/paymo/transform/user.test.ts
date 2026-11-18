import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawPaymoUser,
} from '../../../../../../../src/verticals/projects/adapters/paymo/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

const baseRaw: RawPaymoUser = {
  id: 42,
  name: 'Jane Doe',
  email: 'jane.doe@acme.example',
  type: 'admin',
  active: true,
  timezone: 'America/New_York',
  assigned_projects: [201, 202],
  managed_projects: [201],
}

describe('transformUser', () => {
  it('maps id and externalId as stringified numeric id', () => {
    const result = transformUser(baseRaw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name from name field', () => {
    const result = transformUser(baseRaw)
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email from email field', () => {
    const result = transformUser(baseRaw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('omits email when not present', () => {
    const raw: RawPaymoUser = { ...baseRaw, email: undefined }
    const result = transformUser(raw)
    expect(result.email).toBeUndefined()
  })

  it('sets workspaceIds to empty array (no workspace concept in Paymo)', () => {
    const result = transformUser(baseRaw)
    expect(result.workspaceIds).toEqual([])
  })

  it('sets platform to paymo', () => {
    const result = transformUser(baseRaw)
    expect(result.platform).toBe('paymo')
  })

  it('surfaces type and timezone in metadata', () => {
    const result = transformUser(baseRaw)
    expect(result.metadata).toMatchObject({ type: 'admin', timezone: 'America/New_York' })
  })

  it('surfaces active flag in metadata as string', () => {
    const result = transformUser(baseRaw)
    expect(result.metadata).toMatchObject({ active: 'true' })
  })

  it('defaults name to empty string when name is absent', () => {
    const raw: RawPaymoUser = { ...baseRaw, name: undefined }
    const result = transformUser(raw)
    expect(result.name).toBe('')
  })

  it('produces output that passes UserSchema validation', () => {
    const result = transformUser(baseRaw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
