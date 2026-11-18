import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawFavroWidget,
} from '../../../../../../../src/verticals/projects/adapters/favro/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('favro transformProject', () => {
  const raw: RawFavroWidget = {
    widgetCommonId: 'widget-abc',
    organizationId: 'org-xyz',
    collectionIds: ['col-1', 'col-2'],
    name: 'Product Backlog',
    type: 'backlog',
    color: 'blue',
    ownerRole: 'fullMember',
    editRole: 'fullMember',
    archived: false,
  }

  it('maps id and externalId from widgetCommonId', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('widget-abc')
    expect(result.externalId).toBe('widget-abc')
  })

  it('maps workspaceId from organizationId', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('org-xyz')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Product Backlog')
  })

  it('status is active when archived is false', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when archived is true', () => {
    const result = transformProject({ ...raw, archived: true })
    expect(result.status).toBe('archived')
  })

  it('createdAt and updatedAt are always undefined (not on widget object)', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('ownerId is always undefined (not on widget object)', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBeUndefined()
  })

  it('platform is favro', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('favro')
  })

  it('metadata.type reflects type', () => {
    const result = transformProject(raw)
    expect(result.metadata.type).toBe('backlog')
  })

  it('metadata.color reflects color', () => {
    const result = transformProject(raw)
    expect(result.metadata.color).toBe('blue')
  })

  it('metadata.collectionIds is comma-joined list', () => {
    const result = transformProject(raw)
    expect(result.metadata.collectionIds).toBe('col-1,col-2')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
