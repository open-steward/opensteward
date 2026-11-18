import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawYandexTrackerIssue,
} from '../../../../../../../src/verticals/projects/adapters/yandex-tracker/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('yandex-tracker transformTask', () => {
  const raw: RawYandexTrackerIssue = {
    id: 'issue-1',
    key: 'PROJ-42',
    summary: 'Fix critical bug',
    description: 'Needs urgent attention',
    status: { key: 'inprogress', display: 'In Progress' },
    priority: { key: 'critical', display: 'Critical' },
    type: { key: 'bug', display: 'Bug' },
    assignee: { id: 'user-99', display: 'Alice' },
    createdBy: { id: 'user-1', display: 'Bob' },
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-02-01T14:00:00.000Z',
    parent: { id: 'issue-0', key: 'PROJ-1' },
    project: { primary: { id: 'proj-5', display: 'My Project' } },
    queue: { id: 'queue-3', key: 'PROJ', display: 'Project Queue' },
    tags: ['urgent', 'backend'],
    deadline: '2024-03-01T00:00:00.000Z',
  }

  it('maps id and externalId from raw', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('issue-1')
    expect(result.externalId).toBe('PROJ-42')
  })

  it('uses key as externalId when present', () => {
    const result = transformTask(raw)
    expect(result.externalId).toBe('PROJ-42')
  })

  it('falls back to id string when key absent', () => {
    const result = transformTask({ ...raw, key: undefined })
    expect(result.externalId).toBe('issue-1')
  })

  it('maps title from summary', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Fix critical bug')
  })

  it('maps description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Needs urgent attention')
  })

  it('maps projectId from argument when provided', () => {
    const result = transformTask(raw, 'override-proj')
    expect(result.projectId).toBe('override-proj')
  })

  it('maps projectId from project.primary.id when argument absent', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj-5')
  })

  it('maps projectId from queue.id when project absent', () => {
    const result = transformTask({ ...raw, project: null })
    expect(result.projectId).toBe('queue-3')
  })

  it('maps parentId from parent', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('issue-0')
  })

  it('parentId is undefined when parent absent', () => {
    const result = transformTask({ ...raw, parent: null })
    expect(result.parentId).toBeUndefined()
  })

  it('maps assigneeIds from assignee', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['user-99'])
  })

  it('assigneeIds is empty when assignee absent', () => {
    const result = transformTask({ ...raw, assignee: null })
    expect(result.assigneeIds).toEqual([])
  })

  it('maps tagIds from tags array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['urgent', 'backend'])
  })

  it('tagIds is empty when tags absent', () => {
    const result = transformTask({ ...raw, tags: undefined })
    expect(result.tagIds).toEqual([])
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-01T14:00:00.000Z')
  })

  it('maps dueDate from deadline', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is yandex-tracker', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('yandex-tracker')
  })

  it('metadata includes key and queueKey', () => {
    const result = transformTask(raw)
    expect(result.metadata.key).toBe('PROJ-42')
    expect(result.metadata.queueKey).toBe('PROJ')
  })

  describe('status mapping', () => {
    it('inprogress maps to in_progress', () => {
      const result = transformTask({ ...raw, status: { key: 'inprogress' } })
      expect(result.status).toBe('in_progress')
    })

    it('in_progress maps to in_progress', () => {
      const result = transformTask({ ...raw, status: { key: 'in_progress' } })
      expect(result.status).toBe('in_progress')
    })

    it('closed maps to closed', () => {
      const result = transformTask({ ...raw, status: { key: 'closed' } })
      expect(result.status).toBe('closed')
    })

    it('resolved maps to closed', () => {
      const result = transformTask({ ...raw, status: { key: 'resolved' } })
      expect(result.status).toBe('closed')
    })

    it('cancelled maps to closed', () => {
      const result = transformTask({ ...raw, status: { key: 'cancelled' } })
      expect(result.status).toBe('closed')
    })

    it('rejected maps to closed', () => {
      const result = transformTask({ ...raw, status: { key: 'rejected' } })
      expect(result.status).toBe('closed')
    })

    it('unknown status maps to open', () => {
      const result = transformTask({ ...raw, status: { key: 'backlog' } })
      expect(result.status).toBe('open')
    })

    it('absent status maps to open', () => {
      const result = transformTask({ ...raw, status: undefined })
      expect(result.status).toBe('open')
    })
  })

  describe('priority mapping', () => {
    it('blocker maps to urgent', () => {
      const result = transformTask({ ...raw, priority: { key: 'blocker' } })
      expect(result.priority).toBe('urgent')
    })

    it('critical maps to urgent', () => {
      const result = transformTask({ ...raw, priority: { key: 'critical' } })
      expect(result.priority).toBe('urgent')
    })

    it('major maps to high', () => {
      const result = transformTask({ ...raw, priority: { key: 'major' } })
      expect(result.priority).toBe('high')
    })

    it('high maps to high', () => {
      const result = transformTask({ ...raw, priority: { key: 'high' } })
      expect(result.priority).toBe('high')
    })

    it('normal maps to medium', () => {
      const result = transformTask({ ...raw, priority: { key: 'normal' } })
      expect(result.priority).toBe('medium')
    })

    it('medium maps to medium', () => {
      const result = transformTask({ ...raw, priority: { key: 'medium' } })
      expect(result.priority).toBe('medium')
    })

    it('minor maps to low', () => {
      const result = transformTask({ ...raw, priority: { key: 'minor' } })
      expect(result.priority).toBe('low')
    })

    it('low maps to low', () => {
      const result = transformTask({ ...raw, priority: { key: 'low' } })
      expect(result.priority).toBe('low')
    })

    it('trivial maps to low', () => {
      const result = transformTask({ ...raw, priority: { key: 'trivial' } })
      expect(result.priority).toBe('low')
    })

    it('unknown priority maps to undefined', () => {
      const result = transformTask({ ...raw, priority: { key: 'unknown_prio' } })
      expect(result.priority).toBeUndefined()
    })

    it('absent priority maps to undefined', () => {
      const result = transformTask({ ...raw, priority: undefined })
      expect(result.priority).toBeUndefined()
    })
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
