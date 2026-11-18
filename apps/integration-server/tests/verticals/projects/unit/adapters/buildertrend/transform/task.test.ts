import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawBuildertrendTask,
} from '../../../../../../../src/verticals/projects/adapters/buildertrend/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('buildertrend transformTask', () => {
  const raw: RawBuildertrendTask = {
    id: 300,
    jobId: 200,
    title: 'Pour foundation',
    description: 'Pour and cure concrete foundation',
    completed: false,
    percentComplete: 50,
    priority: 'high',
    dueDate: '2025-05-15T00:00:00.000Z',
    startDate: '2025-04-01T00:00:00.000Z',
    assignedToUserId: 55,
    assignedUsers: [{ id: 66 }],
    createdDate: '2025-01-01T00:00:00.000Z',
    modifiedDate: '2025-04-10T12:00:00.000Z',
  }

  it('maps id from id field', () => {
    const result = transformTask(raw, 'todo')
    expect(result.id).toBe('300')
  })

  it('maps title', () => {
    const result = transformTask(raw, 'todo')
    expect(result.title).toBe('Pour foundation')
  })

  it('projectId from jobId when no arg', () => {
    const result = transformTask(raw, 'todo')
    expect(result.projectId).toBe('200')
  })

  it('projectId uses explicit arg when given', () => {
    const result = transformTask(raw, 'todo', 'explicit_proj')
    expect(result.projectId).toBe('explicit_proj')
  })

  it('status is in_progress when percentComplete=50 and not completed', () => {
    const result = transformTask(raw, 'todo')
    expect(result.status).toBe('in_progress')
  })

  it('status is closed when completed=true', () => {
    const result = transformTask({ ...raw, completed: true }, 'todo')
    expect(result.status).toBe('closed')
  })

  it('status is closed when percentComplete>=100', () => {
    const result = transformTask({ ...raw, percentComplete: 100, completed: false }, 'todo')
    expect(result.status).toBe('closed')
  })

  it('status is open when percentComplete=0', () => {
    const result = transformTask({ ...raw, percentComplete: 0, completed: false }, 'todo')
    expect(result.status).toBe('open')
  })

  it('priority high maps to high', () => {
    const result = transformTask(raw, 'todo')
    expect(result.priority).toBe('high')
  })

  it('priority urgent for critical', () => {
    const result = transformTask({ ...raw, priority: 'critical' }, 'todo')
    expect(result.priority).toBe('urgent')
  })

  it('assigneeIds includes assignedToUserId and assignedUsers entries', () => {
    const result = transformTask(raw, 'todo')
    expect(result.assigneeIds).toContain('55')
    expect(result.assigneeIds).toContain('66')
  })

  it('dueDate maps from dueDate field', () => {
    const result = transformTask(raw, 'todo')
    expect(result.dueDate).toBe('2025-05-15T00:00:00.000Z')
  })

  it('metadata.platformType is todo for todo kind', () => {
    const result = transformTask(raw, 'todo')
    expect(result.metadata.platformType).toBe('todo')
  })

  it('metadata.platformType is scheduleItem for schedule kind', () => {
    const result = transformTask(raw, 'schedule')
    expect(result.metadata.platformType).toBe('scheduleItem')
  })

  it('parentId from parentId field', () => {
    const result = transformTask({ ...raw, parentId: 99 }, 'todo')
    expect(result.parentId).toBe('99')
  })

  it('parentId from phaseId when parentId absent', () => {
    const result = transformTask({ ...raw, parentId: undefined, phaseId: 88 }, 'schedule')
    expect(result.parentId).toBe('88')
  })

  it('platform is buildertrend', () => {
    const result = transformTask(raw, 'todo')
    expect(result.platform).toBe('buildertrend')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw, 'todo', '200')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
