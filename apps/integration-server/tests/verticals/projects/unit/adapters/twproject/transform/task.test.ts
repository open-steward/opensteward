import { describe, it, expect } from 'vitest'
import { transformTask } from '../../../../../../../src/verticals/projects/adapters/twproject/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'
import { TASK_LIST } from '../fixtures/documented-samples'

describe('twproject transformTask (documented task response example)', () => {
  const raw = TASK_LIST.objects[1]!

  it('parses as a canonical Task under the project it was listed for', () => {
    const t = TaskSchema.parse(transformTask(raw, '7900'))
    expect(t).toMatchObject({
      id: '7908',
      externalId: '7908',
      projectId: '7900',
      title: 'Green power plant',
      description: 'With this project we will ...',
      status: 'open',
      assigneeIds: [],
      tagIds: [],
      platform: 'twproject',
    })
    expect(t.parentId).toBeUndefined()
    expect(t.priority).toBeUndefined()
  })

  it('reads end as the due date and creationDate/lastModified as epoch milliseconds', () => {
    const t = transformTask(raw, '7900')
    expect(t.dueDate).toBe(new Date(1518217199998).toISOString())
    expect(t.createdAt).toBe(new Date(1523623493424).toISOString())
    expect(t.updatedAt).toBe(new Date(1523623493430).toISOString())
    expect(t.metadata['start']).toBe(new Date(1514761200000).toISOString())
  })

  it('keeps the comma-separated tags string in metadata, not as tag ids', () => {
    expect(transformTask(raw, '7900').metadata['tags']).toBe('global, green, fuelcell')
  })

  it.each([
    ['STATUS_ACTIVE', 'open'],
    ['STATUS_DONE', 'closed'],
    ['STATUS_SUSPENDED', 'unknown'],
    ['STATUS_WAITING', 'unknown'],
    ['STATUS_FAILED', 'unknown'],
    ['STATUS_UNDEFINED', 'unknown'],
  ])('maps taskStatusType %s to %s', (status, expected) => {
    expect(TaskSchema.parse(transformTask({ ...raw, status }, '7900')).status).toBe(expected)
  })

  it('throws on a task with no name rather than inventing one', () => {
    expect(() => transformTask({ id: '1' }, '7900')).toThrow(/no name/)
  })
})
