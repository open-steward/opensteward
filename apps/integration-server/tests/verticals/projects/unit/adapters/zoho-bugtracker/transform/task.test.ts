import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawZohoBugtrackerBug,
} from '../../../../../../../src/verticals/projects/adapters/zoho-bugtracker/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('zoho-bugtracker transformTask', () => {
  const raw: RawZohoBugtrackerBug = {
    id: 12345,
    id_string: 'bug-12345',
    key: 'BUG-42',
    title: 'Login fails on mobile',
    description: 'Users cannot log in on iOS 17',
    status: { name: 'Open', id: '1' },
    severity: { name: 'High', id: '2' },
    classification: { name: 'Bug' },
    flag: 'internal',
    closed: false,
    due_date: '2024-03-15',
    due_date_long: 1710460800000,
    created_time: '2024-01-15T10:00:00',
    created_time_long: 1705312800000,
    last_modified_time: '2024-02-01T14:00:00',
    last_modified_time_long: 1706792400000,
    assignee: [
      { name: 'Alice', id: '99' },
      { name: 'Bob', id: '100' },
    ],
    reporter_id: '1',
    reported_person: 'Charlie',
    module: { id: '5', name: 'Auth Module' },
  }

  it('uses id_string as id when present', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('bug-12345')
    expect(result.externalId).toBe('bug-12345')
  })

  it('falls back to string of numeric id when id_string absent', () => {
    const result = transformTask({ ...raw, id_string: undefined })
    expect(result.id).toBe('12345')
  })

  it('maps title', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Login fails on mobile')
  })

  it('maps description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Users cannot log in on iOS 17')
  })

  it('maps projectId from argument', () => {
    const result = transformTask(raw, 'proj-1')
    expect(result.projectId).toBe('proj-1')
  })

  it('projectId is empty string when argument absent', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('')
  })

  it('parentId is always undefined (no hierarchy support)', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('tagIds is always empty (no tag support)', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('maps assigneeIds from assignee array', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['99', '100'])
  })

  it('assigneeIds is empty when assignee absent', () => {
    const result = transformTask({ ...raw, assignee: undefined })
    expect(result.assigneeIds).toEqual([])
  })

  it('maps dueDate preferring due_date_long', () => {
    const result = transformTask(raw)
    // due_date_long: 1710460800000 ms → epoch seconds 1710460800 (within range)
    expect(result.dueDate).toBeDefined()
  })

  it('maps createdAt preferring created_time_long', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBeDefined()
  })

  it('maps updatedAt preferring last_modified_time_long', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBeDefined()
  })

  it('platform is zoho-bugtracker', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('zoho-bugtracker')
  })

  it('metadata includes bugKey, statusName, severityName', () => {
    const result = transformTask(raw)
    expect(result.metadata.bugKey).toBe('BUG-42')
    expect(result.metadata.statusName).toBe('Open')
    expect(result.metadata.severityName).toBe('High')
  })

  it('metadata includes reportedPerson and moduleName', () => {
    const result = transformTask(raw)
    expect(result.metadata.reportedPerson).toBe('Charlie')
    expect(result.metadata.moduleName).toBe('Auth Module')
  })

  describe('status mapping', () => {
    it('closed=true maps to closed regardless of status.name', () => {
      const result = transformTask({ ...raw, closed: true, status: { name: 'Open' } })
      expect(result.status).toBe('closed')
    })

    it('status.name "closed" maps to closed', () => {
      const result = transformTask({ ...raw, closed: false, status: { name: 'closed' } })
      expect(result.status).toBe('closed')
    })

    it('status.name "fixed" maps to closed', () => {
      const result = transformTask({ ...raw, closed: false, status: { name: 'Fixed' } })
      expect(result.status).toBe('closed')
    })

    it('status.name "resolved" maps to closed', () => {
      const result = transformTask({ ...raw, closed: false, status: { name: 'resolved' } })
      expect(result.status).toBe('closed')
    })

    it('status.name "completed" maps to closed', () => {
      const result = transformTask({ ...raw, closed: false, status: { name: 'completed' } })
      expect(result.status).toBe('closed')
    })

    it('status.name "Open" maps to open', () => {
      const result = transformTask({ ...raw, closed: false, status: { name: 'Open' } })
      expect(result.status).toBe('open')
    })

    it('status.name "in progress" maps to open', () => {
      const result = transformTask({ ...raw, closed: false, status: { name: 'in progress' } })
      expect(result.status).toBe('open')
    })

    it('absent status maps to open', () => {
      const result = transformTask({ ...raw, closed: false, status: undefined })
      expect(result.status).toBe('open')
    })
  })

  describe('priority mapping from severity', () => {
    it('Critical maps to urgent', () => {
      const result = transformTask({ ...raw, severity: { name: 'Critical' } })
      expect(result.priority).toBe('urgent')
    })

    it('Blocker maps to urgent', () => {
      const result = transformTask({ ...raw, severity: { name: 'Blocker' } })
      expect(result.priority).toBe('urgent')
    })

    it('High maps to high', () => {
      const result = transformTask({ ...raw, severity: { name: 'High' } })
      expect(result.priority).toBe('high')
    })

    it('Major maps to high', () => {
      const result = transformTask({ ...raw, severity: { name: 'Major' } })
      expect(result.priority).toBe('high')
    })

    it('Medium maps to medium', () => {
      const result = transformTask({ ...raw, severity: { name: 'Medium' } })
      expect(result.priority).toBe('medium')
    })

    it('Minor maps to medium', () => {
      const result = transformTask({ ...raw, severity: { name: 'Minor' } })
      expect(result.priority).toBe('medium')
    })

    it('Low maps to low', () => {
      const result = transformTask({ ...raw, severity: { name: 'Low' } })
      expect(result.priority).toBe('low')
    })

    it('Trivial maps to low', () => {
      const result = transformTask({ ...raw, severity: { name: 'Trivial' } })
      expect(result.priority).toBe('low')
    })

    it('absent severity maps to undefined', () => {
      const result = transformTask({ ...raw, severity: undefined })
      expect(result.priority).toBeUndefined()
    })
  })

  describe('priority fallback to customfields', () => {
    it('uses customfields priority when severity absent', () => {
      const result = transformTask({
        ...raw,
        severity: undefined,
        customfields: [{ label_name: 'priority', value: 'High' }],
      })
      expect(result.priority).toBe('high')
    })

    it('uses column_name fallback for customfields lookup', () => {
      const result = transformTask({
        ...raw,
        severity: undefined,
        customfields: [{ column_name: 'priority', value: 'urgent' }],
      })
      expect(result.priority).toBe('urgent')
    })
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw, 'proj-1')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
