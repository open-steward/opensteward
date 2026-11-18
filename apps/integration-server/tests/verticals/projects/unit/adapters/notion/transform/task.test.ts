import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawNotionPage,
} from '../../../../../../../src/verticals/projects/adapters/notion/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

function makePage(overrides: Partial<RawNotionPage> = {}): RawNotionPage {
  return {
    object: 'page',
    id: 'page-notion-1',
    parent: { type: 'database_id', database_id: 'db-backlog' },
    properties: {
      Name: {
        type: 'title',
        title: [{ type: 'text', plain_text: 'Implement login flow' }],
      },
      Status: {
        type: 'status',
        status: { name: 'In Progress' },
      },
      Priority: {
        type: 'select',
        select: { name: 'High' },
      },
      Due: {
        type: 'date',
        date: { start: '2024-05-01T00:00:00.000Z' },
      },
      Assignees: {
        type: 'people',
        people: [{ id: 'usr-alice' }, { id: 'usr-bob' }],
      },
      Tags: {
        type: 'multi_select',
        multi_select: [
          { id: 'tag-backend', name: 'Backend' },
          { id: 'tag-auth', name: 'Auth' },
        ],
      },
    },
    created_time: '2024-01-20T08:00:00.000Z',
    last_edited_time: '2024-03-10T12:00:00.000Z',
    created_by: { id: 'usr-creator' },
    last_edited_by: { id: 'usr-editor' },
    in_trash: false,
    is_archived: false,
    url: 'https://notion.so/page-notion-1',
    ...overrides,
  }
}

describe('notion transformTask', () => {
  it('maps id and externalId from raw.id', () => {
    const result = transformTask(makePage())
    expect(result.id).toBe('page-notion-1')
    expect(result.externalId).toBe('page-notion-1')
  })

  it('maps projectId from explicit arg', () => {
    const result = transformTask(makePage(), 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('falls back to parent.database_id for projectId', () => {
    const result = transformTask(makePage())
    expect(result.projectId).toBe('db-backlog')
  })

  it('maps title from title property', () => {
    const result = transformTask(makePage())
    expect(result.title).toBe('Implement login flow')
  })

  it('status is in_progress for "In Progress"', () => {
    const result = transformTask(makePage())
    expect(result.status).toBe('in_progress')
  })

  it('status is closed when checkbox is true', () => {
    const result = transformTask(
      makePage({
        properties: {
          Done: { type: 'checkbox', checkbox: true },
        },
      }),
    )
    expect(result.status).toBe('closed')
  })

  it('status is closed for "Done" status name', () => {
    const result = transformTask(
      makePage({
        properties: {
          Status: { type: 'status', status: { name: 'Done' } },
        },
      }),
    )
    expect(result.status).toBe('closed')
  })

  it('status is cancelled when in_trash is true', () => {
    const result = transformTask(makePage({ in_trash: true }))
    expect(result.status).toBe('cancelled')
  })

  it('status is cancelled for "Cancelled" status name', () => {
    const result = transformTask(
      makePage({
        properties: {
          Status: { type: 'status', status: { name: 'Cancelled' } },
        },
      }),
    )
    expect(result.status).toBe('cancelled')
  })

  it('status is in_review for "In Review" status name', () => {
    const result = transformTask(
      makePage({
        properties: {
          Status: { type: 'status', status: { name: 'In Review' } },
        },
      }),
    )
    expect(result.status).toBe('in_review')
  })

  it('status is open for unrecognized status name', () => {
    const result = transformTask(
      makePage({
        properties: {
          Status: { type: 'status', status: { name: 'Someday' } },
        },
      }),
    )
    expect(result.status).toBe('open')
  })

  it('maps priority high from Priority property', () => {
    const result = transformTask(makePage())
    expect(result.priority).toBe('high')
  })

  it('maps priority urgent from Priority select', () => {
    const result = transformTask(
      makePage({
        properties: {
          Priority: { type: 'select', select: { name: 'Urgent' } },
        },
      }),
    )
    expect(result.priority).toBe('urgent')
  })

  it('maps priority medium from Priority select', () => {
    const result = transformTask(
      makePage({
        properties: {
          Priority: { type: 'select', select: { name: 'Medium' } },
        },
      }),
    )
    expect(result.priority).toBe('medium')
  })

  it('maps priority low from Priority select', () => {
    const result = transformTask(
      makePage({
        properties: {
          Priority: { type: 'select', select: { name: 'Low' } },
        },
      }),
    )
    expect(result.priority).toBe('low')
  })

  it('priority is undefined when no Priority property', () => {
    const result = transformTask(
      makePage({
        properties: {
          Status: { type: 'status', status: { name: 'Open' } },
        },
      }),
    )
    expect(result.priority).toBeUndefined()
  })

  it('maps dueDate from date property start', () => {
    const result = transformTask(makePage())
    expect(result.dueDate).toBe('2024-05-01T00:00:00.000Z')
  })

  it('maps assigneeIds from people property', () => {
    const result = transformTask(makePage())
    expect(result.assigneeIds).toEqual(['usr-alice', 'usr-bob'])
  })

  it('maps tagIds from multi_select property', () => {
    const result = transformTask(makePage())
    expect(result.tagIds).toEqual(['tag-backend', 'tag-auth'])
  })

  it('parentId is set when parent.type is page_id', () => {
    const result = transformTask(makePage({ parent: { type: 'page_id', page_id: 'parent-page' } }))
    expect(result.parentId).toBe('parent-page')
  })

  it('parentId is undefined when parent.type is database_id', () => {
    const result = transformTask(makePage())
    expect(result.parentId).toBeUndefined()
  })

  it('maps createdAt from raw.created_time', () => {
    const result = transformTask(makePage())
    expect(result.createdAt).toBe('2024-01-20T08:00:00.000Z')
  })

  it('maps updatedAt from raw.last_edited_time', () => {
    const result = transformTask(makePage())
    expect(result.updatedAt).toBe('2024-03-10T12:00:00.000Z')
  })

  it('platform is notion', () => {
    const result = transformTask(makePage())
    expect(result.platform).toBe('notion')
  })

  it('metadata.platformType is page when not a subpage', () => {
    const result = transformTask(makePage())
    expect(result.metadata.platformType).toBe('page')
  })

  it('metadata.platformType is subpage when parent.type is page_id', () => {
    const result = transformTask(makePage({ parent: { type: 'page_id', page_id: 'parent-p' } }))
    expect(result.metadata.platformType).toBe('subpage')
  })

  it('metadata.url reflects raw.url', () => {
    const result = transformTask(makePage())
    expect(result.metadata.url).toBe('https://notion.so/page-notion-1')
  })

  it('passes TaskSchema.parse without throwing', () => {
    const result = transformTask(makePage())
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
