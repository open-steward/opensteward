import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawOnesIssue,
} from '../../../../../../../src/verticals/projects/adapters/ones/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('ones transformTask', () => {
  const raw: RawOnesIssue = {
    id: 'issue_001',
    name: 'Fix login bug',
    description: 'Users cannot log in with SSO.',
    status: { id: 'st_1', name: 'In Progress', category: 'in_progress' },
    priority: { id: 'p1', name: 'High', value: 'high' },
    projectID: 'proj_abc',
    parentID: 'issue_000',
    assignees: [{ id: 'usr_a' }, { id: 'usr_b' }],
    subIssueCount: 3,
    deadline: 1750000000,
    createTime: 1700000000,
    updateTime: 1700500000,
  }

  it('maps id and title from name', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('issue_001')
    expect(result.title).toBe('Fix login bug')
  })

  it('falls back to title field when name is absent', () => {
    const result = transformTask({ ...raw, name: undefined, title: 'Alt title' })
    expect(result.title).toBe('Alt title')
  })

  it('maps projectId from raw.projectID', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj_abc')
  })

  it('projectId argument overrides raw.projectID', () => {
    const result = transformTask(raw, 'proj_override')
    expect(result.projectId).toBe('proj_override')
  })

  it('maps parentId', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('issue_000')
  })

  it('maps status in_progress → in_progress', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('maps status done → closed', () => {
    const result = transformTask({ ...raw, status: { id: 'st_2', name: 'Done', category: 'done' } })
    expect(result.status).toBe('closed')
  })

  it('maps status with no category → open', () => {
    const result = transformTask({ ...raw, status: undefined })
    expect(result.status).toBe('open')
  })

  it('maps priority high → high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('maps priority urgent → urgent', () => {
    const result = transformTask({
      ...raw,
      priority: { id: 'p0', name: 'Urgent', value: 'urgent' },
    })
    expect(result.priority).toBe('urgent')
  })

  it('maps priority medium → medium', () => {
    const result = transformTask({
      ...raw,
      priority: { id: 'pm', name: 'Medium', value: 'medium' },
    })
    expect(result.priority).toBe('medium')
  })

  it('maps priority low → low', () => {
    const result = transformTask({ ...raw, priority: { id: 'pl', name: 'Low', value: 'low' } })
    expect(result.priority).toBe('low')
  })

  it('maps assigneeIds from assignees array', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['usr_a', 'usr_b'])
  })

  it('falls back to assign field when assignees is empty', () => {
    const result = transformTask({ ...raw, assignees: [], assign: 'usr_c' })
    expect(result.assigneeIds).toEqual(['usr_c'])
  })

  it('maps subtaskCount', () => {
    const result = transformTask(raw)
    expect(result.subtaskCount).toBe(3)
  })

  it('maps dueDate from epoch seconds deadline', () => {
    const result = transformTask(raw)
    // 1750000000 is treated as epoch seconds → multiplied by 1000
    expect(result.dueDate).toBe(new Date(1750000000 * 1000).toISOString())
  })

  it('platform is ones', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('ones')
  })

  it('metadata.platformType is subissue when parentID present', () => {
    const result = transformTask(raw)
    expect(result.metadata.platformType).toBe('subissue')
  })

  it('metadata.platformType is issue when no parentID', () => {
    const result = transformTask({ ...raw, parentID: undefined })
    expect(result.metadata.platformType).toBe('issue')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
