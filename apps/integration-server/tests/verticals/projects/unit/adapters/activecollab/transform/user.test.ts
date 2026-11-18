import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawActivecollabUser,
} from '../../../../../../../src/verticals/projects/adapters/activecollab/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('activecollab transformUser', () => {
  const raw: RawActivecollabUser = {
    id: 7,
    class: 'Member',
    display_name: 'Jane Doe',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@acme.example',
    company_id: 5,
    title: 'Engineer',
    is_archived: false,
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('name prefers display_name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('name falls back to first_name + last_name when display_name is absent', () => {
    const result = transformUser({ ...raw, display_name: undefined })
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane@acme.example')
  })

  it('workspaceIds is empty (no workspace concept in ActiveCollab)', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is activecollab', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('activecollab')
  })

  it('metadata.role reflects the class field', () => {
    const result = transformUser(raw)
    expect(result.metadata.role).toBe('Member')
  })

  it('metadata.title is present', () => {
    const result = transformUser(raw)
    expect(result.metadata.title).toBe('Engineer')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('email is undefined when absent', () => {
    const result = transformUser({ id: 1, display_name: 'Bob' })
    expect(result.email).toBeUndefined()
  })

  it('name is empty string when all name fields absent', () => {
    const result = transformUser({ id: 1 })
    expect(result.name).toBe('')
  })
})
