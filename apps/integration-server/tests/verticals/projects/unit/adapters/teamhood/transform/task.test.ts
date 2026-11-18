import { describe, it, expect } from 'vitest'
import { transformTask } from '../../../../../../../src/verticals/projects/adapters/teamhood/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'
import { DOC_ITEM } from '../fixtures'

describe('teamhood transformTask (documented Entities.Item example)', () => {
  it('parses with TaskSchema and maps the documented fields', () => {
    const t = TaskSchema.parse(transformTask(DOC_ITEM))
    expect(t).toMatchObject({
      id: '1bb95843-bb02-45f2-9f02-2db134b33fb2',
      externalId: '1bb95843-bb02-45f2-9f02-2db134b33fb2',
      projectId: 'eda68c12-2514-4c80-ac19-c2445ba2153c',
      parentId: 'd1384d67-f072-4e9e-aa26-5e2f435e4717',
      title: 'Very important item',
      description: 'Description of very important item',
      status: 'open',
      dueDate: '2026-09-26T01:28:17.769Z',
      assigneeIds: ['a81fe286-3aeb-40b4-a2c1-a33356221197'],
      tagIds: ['Tag1', 'Tag2'],
      updatedAt: '2026-09-24T01:28:17.769Z',
      // The documented example's createdDate, mapped as given.
      createdAt: '0001-01-01T00:00:00.000Z',
      platform: 'teamhood',
    })
    expect(t.priority).toBeUndefined()
    expect(t.metadata).toMatchObject({
      displayId: 'ABCD-1234',
      workspaceId: 'b6229379-3529-4372-b238-d96d4e702820',
      statusId: '7c05c47d-6d4c-4a57-8b68-2c372b3fd55b',
      isSuspended: 'true',
      suspendReason: 'Item is suspended',
      url: 'https://company.teamhood.com/EXMPL/Board/EXMPL/ABCD-1234',
    })
  })

  it('takes the project from the board it was listed under', () => {
    expect(transformTask(DOC_ITEM, 'board-x').projectId).toBe('board-x')
  })

  it('refuses an item with no board rather than invent a project', () => {
    expect(() => transformTask({ ...DOC_ITEM, boardId: null })).toThrow(/no boardId/)
  })

  it('closes completed and archived items; a suspended one stays open', () => {
    expect(transformTask({ ...DOC_ITEM, completed: true }).status).toBe('closed')
    expect(transformTask({ ...DOC_ITEM, archived: true }).status).toBe('closed')
    expect(TaskSchema.parse(transformTask({ ...DOC_ITEM, isSuspended: true })).status).toBe('open')
  })

  it('omits what the item leaves null', () => {
    const t = TaskSchema.parse(
      transformTask({
        ...DOC_ITEM,
        parentId: null,
        assignedUserId: null,
        tags: null,
        dueDate: null,
      }),
    )
    expect(t.parentId).toBeUndefined()
    expect(t.assigneeIds).toEqual([])
    expect(t.tagIds).toEqual([])
    expect(t.dueDate).toBeUndefined()
  })
})
