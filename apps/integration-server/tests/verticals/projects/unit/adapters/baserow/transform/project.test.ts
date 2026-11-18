import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawBaserowApplication,
} from '../../../../../../../src/verticals/projects/adapters/baserow/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('baserow transformProject', () => {
  const raw: RawBaserowApplication = {
    id: 42,
    name: 'My Database',
    order: 1,
    type: 'database',
    workspace: { id: 7, name: 'Acme Workspace' },
    tables: [
      { id: 1, name: 'Tasks' },
      { id: 2, name: 'Notes' },
    ],
  }

  it('maps id and name correctly', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('42')
    expect(result.name).toBe('My Database')
  })

  it('maps workspaceId from workspace.id', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('7')
  })

  it('status is always active (no archived field)', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('platform is baserow', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('baserow')
  })

  it('metadata includes type and tableCount', () => {
    const result = transformProject(raw)
    expect(result.metadata.type).toBe('database')
    expect(result.metadata.tableCount).toBe('2')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('workspaceId is empty string when workspace is absent', () => {
    const result = transformProject({ id: 1 })
    expect(result.workspaceId).toBe('')
  })
})
