import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawPingcodeWorkItem,
} from '../../../../../../../src/verticals/projects/adapters/pingcode/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('transformTask', () => {
  it('maps a fully populated work item', () => {
    const raw: RawPingcodeWorkItem = {
      id: 'wi_001',
      identifier: 'PROJ-42',
      title: 'Fix login bug',
      description: 'Users cannot log in on mobile.',
      type: 'bug',
      project_id: 'proj_001',
      parent_id: 'wi_000',
      state: { id: 'state_1', name: 'In Progress', type: 'started' },
      assignee: { id: 'usr_jane' },
      priority: { id: 'pri_2', name: 'high', value: 2 },
      sprint_id: 'sprint_5',
      due_date: 1705320000,
      created_at: 1705100000,
      updated_at: 1705200000,
    }

    const result = transformTask(raw, 'proj_001')

    expect(result.id).toBe('wi_001')
    expect(result.externalId).toBe('wi_001')
    expect(result.projectId).toBe('proj_001')
    expect(result.parentId).toBe('wi_000')
    expect(result.title).toBe('Fix login bug')
    expect(result.status).toBe('in_progress')
    expect(result.priority).toBe('high')
    expect(result.assigneeIds).toEqual(['usr_jane'])
    expect(result.dueDate).toBe(new Date(1705320000 * 1000).toISOString())
    expect(result.platform).toBe('pingcode')
    expect(result.metadata.platformType).toBe('bug')
    expect(result.metadata.identifier).toBe('PROJ-42')
    expect(result.metadata.stateId).toBe('state_1')
    expect(result.metadata.stateName).toBe('In Progress')
    expect(result.metadata.sprintId).toBe('sprint_5')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  describe('status mapping', () => {
    const cases: Array<[string, string]> = [
      ['unstarted', 'open'],
      ['pending', 'open'],
      ['started', 'in_progress'],
      ['in_progress', 'in_progress'],
      ['completed', 'closed'],
      ['done', 'closed'],
      ['canceled', 'cancelled'],
      ['cancelled', 'cancelled'],
    ]

    for (const [stateType, expectedStatus] of cases) {
      it(`maps state.type "${stateType}" to status "${expectedStatus}"`, () => {
        const raw: RawPingcodeWorkItem = {
          id: `wi_status_${stateType}`,
          state: { type: stateType },
        }
        const result = transformTask(raw)
        expect(result.status).toBe(expectedStatus)
        expect(() => TaskSchema.parse(result)).not.toThrow()
      })
    }

    it('defaults to "open" for unknown state type', () => {
      const raw: RawPingcodeWorkItem = {
        id: 'wi_unknown_state',
        state: { type: 'some_unknown_type' },
      }
      const result = transformTask(raw)
      expect(result.status).toBe('open')
      expect(() => TaskSchema.parse(result)).not.toThrow()
    })

    it('defaults to "open" when state is null', () => {
      const raw: RawPingcodeWorkItem = {
        id: 'wi_no_state',
        state: null,
      }
      const result = transformTask(raw)
      expect(result.status).toBe('open')
      expect(() => TaskSchema.parse(result)).not.toThrow()
    })
  })

  describe('priority mapping', () => {
    const cases: Array<[string, string]> = [
      ['urgent', 'urgent'],
      ['critical', 'urgent'],
      ['highest', 'urgent'],
      ['high', 'high'],
      ['medium', 'medium'],
      ['normal', 'medium'],
      ['low', 'low'],
      ['lowest', 'low'],
    ]

    for (const [priorityName, expectedPriority] of cases) {
      it(`maps priority.name "${priorityName}" to "${expectedPriority}"`, () => {
        const raw: RawPingcodeWorkItem = {
          id: `wi_pri_${priorityName}`,
          state: { type: 'started' },
          priority: { name: priorityName },
        }
        const result = transformTask(raw)
        expect(result.priority).toBe(expectedPriority)
        expect(() => TaskSchema.parse(result)).not.toThrow()
      })
    }

    it('returns undefined priority for unrecognized priority name', () => {
      const raw: RawPingcodeWorkItem = {
        id: 'wi_no_priority',
        priority: { name: 'unknown_priority' },
      }
      const result = transformTask(raw)
      expect(result.priority).toBeUndefined()
      expect(() => TaskSchema.parse(result)).not.toThrow()
    })
  })

  it('resolves assigneeId when assignee is a plain string', () => {
    const raw: RawPingcodeWorkItem = {
      id: 'wi_str_assignee',
      assignee: 'usr_bob',
    }
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['usr_bob'])
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('produces empty assigneeIds when assignee is null', () => {
    const raw: RawPingcodeWorkItem = {
      id: 'wi_no_assignee',
      assignee: null,
    }
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual([])
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('falls back to raw.project_id when no projectId arg is passed', () => {
    const raw: RawPingcodeWorkItem = {
      id: 'wi_proj_fallback',
      project_id: 'proj_from_raw',
    }
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj_from_raw')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('produces empty tagIds array', () => {
    const raw: RawPingcodeWorkItem = {
      id: 'wi_tags',
    }
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
