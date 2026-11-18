import { describe, it, expect } from 'vitest'
import {
  transformIssue,
  type RawRedmineIssue,
} from '../../../../../../../src/verticals/projects/adapters/redmine/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('redmine transformIssue', () => {
  const raw: RawRedmineIssue = {
    id: 55,
    project: { id: 12, name: 'My Project' },
    tracker: { id: 2, name: 'Feature' },
    status: { id: 1, name: 'New' },
    priority: { id: 2, name: 'Normal' },
    author: { id: 3, name: 'Bob' },
    assigned_to: { id: 7, name: 'Alice' },
    subject: 'Fix the bug',
    description: 'Details here',
    created_on: '2024-01-15T10:00:00.000Z',
    updated_on: '2024-02-01T14:00:00.000Z',
  }

  it('maps id to string', () => {
    const result = transformIssue(raw)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('maps title from subject', () => {
    const result = transformIssue(raw)
    expect(result.title).toBe('Fix the bug')
  })

  it('maps description', () => {
    const result = transformIssue(raw)
    expect(result.description).toBe('Details here')
  })

  it('maps projectId from argument when provided', () => {
    const result = transformIssue(raw, 'proj_override')
    expect(result.projectId).toBe('proj_override')
  })

  it('maps projectId from raw.project.id when argument absent', () => {
    const result = transformIssue(raw)
    expect(result.projectId).toBe('12')
  })

  it('platform is redmine', () => {
    const result = transformIssue(raw)
    expect(result.platform).toBe('redmine')
  })

  it('maps assigneeIds from assigned_to', () => {
    const result = transformIssue(raw)
    expect(result.assigneeIds).toEqual(['7'])
  })

  it('assigneeIds is empty when assigned_to absent', () => {
    const result = transformIssue({ ...raw, assigned_to: undefined })
    expect(result.assigneeIds).toEqual([])
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformIssue(raw)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-01T14:00:00.000Z')
  })

  it('metadata includes tracker, statusName, authorId', () => {
    const result = transformIssue(raw)
    expect(result.metadata.tracker).toBe('Feature')
    expect(result.metadata.statusName).toBe('New')
    expect(result.metadata.authorId).toBe('3')
  })

  it('maps parentId when parent present', () => {
    const result = transformIssue({ ...raw, parent: { id: 10 } })
    expect(result.parentId).toBe('10')
  })

  it('parentId undefined when parent absent', () => {
    const result = transformIssue(raw)
    expect(result.parentId).toBeUndefined()
  })

  describe('status mapping (case-insensitive via toLowerCase)', () => {
    it('"closed" maps to closed', () => {
      const result = transformIssue({ ...raw, status: { id: 5, name: 'closed' } })
      expect(result.status).toBe('closed')
    })

    it('"Closed" maps to closed (case-insensitive)', () => {
      const result = transformIssue({ ...raw, status: { id: 5, name: 'Closed' } })
      expect(result.status).toBe('closed')
    })

    it('"rejected" maps to closed', () => {
      const result = transformIssue({ ...raw, status: { id: 6, name: 'rejected' } })
      expect(result.status).toBe('closed')
    })

    it('"resolved" maps to closed', () => {
      const result = transformIssue({ ...raw, status: { id: 3, name: 'resolved' } })
      expect(result.status).toBe('closed')
    })

    it('"In Progress" maps to in_progress (case-insensitive)', () => {
      const result = transformIssue({ ...raw, status: { id: 2, name: 'In Progress' } })
      expect(result.status).toBe('in_progress')
    })

    it('"in_progress" maps to in_progress', () => {
      const result = transformIssue({ ...raw, status: { id: 2, name: 'in_progress' } })
      expect(result.status).toBe('in_progress')
    })

    it('"New" maps to open (default)', () => {
      const result = transformIssue({ ...raw, status: { id: 1, name: 'New' } })
      expect(result.status).toBe('open')
    })

    it('absent status maps to open (default)', () => {
      const result = transformIssue({ ...raw, status: undefined })
      expect(result.status).toBe('open')
    })
  })

  describe('priority mapping (case-insensitive via toLowerCase)', () => {
    it('"Urgent" maps to urgent', () => {
      const result = transformIssue({ ...raw, priority: { id: 4, name: 'Urgent' } })
      expect(result.priority).toBe('urgent')
    })

    it('"Immediate" maps to urgent', () => {
      const result = transformIssue({ ...raw, priority: { id: 5, name: 'Immediate' } })
      expect(result.priority).toBe('urgent')
    })

    it('"High" maps to high', () => {
      const result = transformIssue({ ...raw, priority: { id: 3, name: 'High' } })
      expect(result.priority).toBe('high')
    })

    it('"Normal" maps to medium', () => {
      const result = transformIssue({ ...raw, priority: { id: 2, name: 'Normal' } })
      expect(result.priority).toBe('medium')
    })

    it('"Low" maps to low', () => {
      const result = transformIssue({ ...raw, priority: { id: 1, name: 'Low' } })
      expect(result.priority).toBe('low')
    })

    it('unknown priority maps to undefined', () => {
      const result = transformIssue({ ...raw, priority: { id: 99, name: 'Blocker' } })
      expect(result.priority).toBeUndefined()
    })

    it('absent priority maps to undefined', () => {
      const result = transformIssue({ ...raw, priority: undefined })
      expect(result.priority).toBeUndefined()
    })
  })

  it('passes TaskSchema.parse', () => {
    const result = transformIssue(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
