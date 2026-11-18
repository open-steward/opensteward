import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawTogglPlanGroup,
} from '../../../../../../../src/verticals/projects/adapters/toggl-plan/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('toggl-plan transformWorkspace', () => {
  const raw: RawTogglPlanGroup = {
    id: 200,
    name: 'Frontend Team',
    memberships: [
      { id: 1, user_id: 101, position: 0, weight: 0, created_at: '2024-01-01T00:00:00.000Z' },
      { id: 2, user_id: 202, position: 1, weight: 0, created_at: '2024-01-02T00:00:00.000Z' },
      { id: 3, user_id: 303, position: 2, weight: 0, created_at: '2024-01-03T00:00:00.000Z' },
    ],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-03-01T00:00:00.000Z',
  }

  it('maps id and externalId from raw.id as string', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('200')
    expect(result.externalId).toBe('200')
  })

  it('maps name correctly', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Frontend Team')
  })

  it('memberCount is derived from memberships length', () => {
    const result = transformWorkspace(raw)
    expect(result.memberCount).toBe(3)
  })

  it('memberCount is 0 when memberships is absent', () => {
    const result = transformWorkspace({ ...raw, memberships: undefined })
    expect(result.memberCount).toBe(0)
  })

  it('platform is toggl-plan', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('toggl-plan')
  })

  it('metadata stores parentWorkspaceId when supplied', () => {
    const result = transformWorkspace(raw, 'ws-root')
    expect(result.metadata['parentWorkspaceId']).toBe('ws-root')
  })

  it('metadata stores memberIds as comma-separated string', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata['memberIds']).toBe('101,202,303')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
