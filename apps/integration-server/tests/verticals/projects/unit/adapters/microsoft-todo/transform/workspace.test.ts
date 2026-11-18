import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawMeUser,
} from '../../../../../../../src/verticals/projects/adapters/microsoft-todo/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('microsoft-todo transformWorkspace', () => {
  const raw: RawMeUser = {
    id: 'user-guid-abc',
    displayName: 'Jane Doe',
    userPrincipalName: 'jane.doe@example.com',
    mail: 'jane.doe@example.com',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('user-guid-abc')
    expect(result.externalId).toBe('user-guid-abc')
  })

  it('maps name from displayName', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back name to userPrincipalName when displayName is absent', () => {
    const result = transformWorkspace({ id: 'u-2', userPrincipalName: 'jsmith@example.com' })
    expect(result.name).toBe('jsmith@example.com')
  })

  it('platform is microsoft-todo', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('microsoft-todo')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
