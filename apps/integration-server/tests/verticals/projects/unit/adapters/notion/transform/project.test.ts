import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawNotionDataSource,
} from '../../../../../../../src/verticals/projects/adapters/notion/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

function makeDataSource(overrides: Partial<RawNotionDataSource> = {}): RawNotionDataSource {
  return {
    object: 'database',
    id: 'db-notion-1',
    title: [{ type: 'text', plain_text: 'Product Backlog' }],
    description: [{ type: 'text', plain_text: 'All product tasks.' }],
    parent: { type: 'page_id', page_id: 'parent-page-1' },
    is_inline: false,
    in_trash: false,
    is_archived: false,
    created_time: '2024-01-05T10:00:00.000Z',
    last_edited_time: '2024-03-15T14:00:00.000Z',
    created_by: { id: 'usr-creator' },
    last_edited_by: { id: 'usr-editor' },
    url: 'https://notion.so/db-notion-1',
    ...overrides,
  }
}

describe('notion transformProject', () => {
  it('maps id and externalId from raw.id', () => {
    const result = transformProject(makeDataSource())
    expect(result.id).toBe('db-notion-1')
    expect(result.externalId).toBe('db-notion-1')
  })

  it('maps workspaceId from parent.page_id', () => {
    const result = transformProject(makeDataSource())
    expect(result.workspaceId).toBe('parent-page-1')
  })

  it('prefers parent.database_id over parent.page_id for workspaceId', () => {
    const result = transformProject(
      makeDataSource({ parent: { type: 'database_id', database_id: 'db-parent' } }),
    )
    expect(result.workspaceId).toBe('db-parent')
  })

  it('workspaceId is empty string when no parent ids', () => {
    const result = transformProject(makeDataSource({ parent: undefined }))
    expect(result.workspaceId).toBe('')
  })

  it('maps name from rich_text title', () => {
    const result = transformProject(makeDataSource())
    expect(result.name).toBe('Product Backlog')
  })

  it('maps description from rich_text description', () => {
    const result = transformProject(makeDataSource())
    expect(result.description).toBe('All product tasks.')
  })

  it('description is undefined when description array is absent', () => {
    const result = transformProject(makeDataSource({ description: undefined }))
    expect(result.description).toBeUndefined()
  })

  it('status is active when in_trash and is_archived are false', () => {
    const result = transformProject(makeDataSource())
    expect(result.status).toBe('active')
  })

  it('status is archived when in_trash is true', () => {
    const result = transformProject(makeDataSource({ in_trash: true }))
    expect(result.status).toBe('archived')
  })

  it('status is archived when is_archived is true', () => {
    const result = transformProject(makeDataSource({ is_archived: true }))
    expect(result.status).toBe('archived')
  })

  it('maps ownerId from raw.created_by.id', () => {
    const result = transformProject(makeDataSource())
    expect(result.ownerId).toBe('usr-creator')
  })

  it('maps createdAt from raw.created_time', () => {
    const result = transformProject(makeDataSource())
    expect(result.createdAt).toBe('2024-01-05T10:00:00.000Z')
  })

  it('maps updatedAt from raw.last_edited_time', () => {
    const result = transformProject(makeDataSource())
    expect(result.updatedAt).toBe('2024-03-15T14:00:00.000Z')
  })

  it('platform is notion', () => {
    const result = transformProject(makeDataSource())
    expect(result.platform).toBe('notion')
  })

  it('metadata.url reflects raw.url', () => {
    const result = transformProject(makeDataSource())
    expect(result.metadata.url).toBe('https://notion.so/db-notion-1')
  })

  it('metadata.lastEditedById reflects last_edited_by.id', () => {
    const result = transformProject(makeDataSource())
    expect(result.metadata.lastEditedById).toBe('usr-editor')
  })

  it('passes ProjectSchema.parse without throwing', () => {
    const result = transformProject(makeDataSource())
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
