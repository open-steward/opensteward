import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawPlaneLabel,
} from '../../../../../../../src/verticals/projects/adapters/plane/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('plane transformTag', () => {
  const raw: RawPlaneLabel = {
    id: 'label-uuid-001',
    name: 'Bug',
    color: '#e53e3e',
    description: 'Something is broken.',
    parent: 'label-uuid-parent',
    project: 'project-uuid-001',
    workspace: 'workspace-uuid-001',
  }

  it('id and externalId map from raw.id', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('label-uuid-001')
    expect(result.externalId).toBe('label-uuid-001')
  })

  it('name maps from raw.name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('Bug')
  })

  it('color maps from raw.color', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#e53e3e')
  })

  it('color is undefined when raw.color is absent', () => {
    const result = transformTag({ ...raw, color: undefined })
    expect(result.color).toBeUndefined()
  })

  it('workspaceId comes from raw.workspace when no arg given', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('workspace-uuid-001')
  })

  it('caller-supplied workspaceId overrides raw.workspace', () => {
    const result = transformTag(raw, 'override-workspace-id')
    expect(result.workspaceId).toBe('override-workspace-id')
  })

  it('workspaceId is empty string when arg and raw.workspace are absent', () => {
    const result = transformTag({ ...raw, workspace: undefined })
    expect(result.workspaceId).toBe('')
  })

  it('metadata.projectId maps from raw.project', () => {
    const result = transformTag(raw)
    expect(result.metadata['projectId']).toBe('project-uuid-001')
  })

  it('metadata.parentId maps from raw.parent', () => {
    const result = transformTag(raw)
    expect(result.metadata['parentId']).toBe('label-uuid-parent')
  })

  it('metadata.parentId is absent when parent is null', () => {
    const result = transformTag({ ...raw, parent: null })
    expect(result.metadata['parentId']).toBeUndefined()
  })

  it('platform is plane', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('plane')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('passes TagSchema.parse when parent and project are absent', () => {
    const result = transformTag({ ...raw, parent: null, project: undefined })
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
