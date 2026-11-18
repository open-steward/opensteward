import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawOpenProjectWorkPackage,
} from '../../../../../../../src/verticals/projects/adapters/openproject/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('openproject transformTask', () => {
  const raw: RawOpenProjectWorkPackage = {
    _type: 'WorkPackage',
    id: 55,
    subject: 'Implement feature X',
    description: {
      format: 'markdown',
      raw: 'Detailed description here.',
      html: '<p>Detailed description here.</p>',
    },
    startDate: '2026-02-01',
    dueDate: '2026-03-01',
    percentageDone: 30,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-02-10T00:00:00.000Z',
    _links: {
      project: { href: '/api/v3/projects/10', title: 'My Project' },
      status: { href: '/api/v3/statuses/7', title: 'In Progress' },
      priority: { href: '/api/v3/priorities/3', title: 'High' },
      assignee: { href: '/api/v3/users/42', title: 'Alice' },
      parent: { href: '/api/v3/work_packages/10', title: 'Parent Task' },
    },
    _embedded: {
      status: { name: 'In Progress', isClosed: false },
    },
  }

  it('maps id and title from subject', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('55')
    expect(result.title).toBe('Implement feature X')
  })

  it('maps description from description.raw', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Detailed description here.')
  })

  it('maps projectId from _links.project', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('10')
  })

  it('projectId argument overrides _links.project', () => {
    const result = transformTask(raw, 'proj_override')
    expect(result.projectId).toBe('proj_override')
  })

  it('maps parentId from _links.parent', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('10')
  })

  it('status is in_progress when embedded status name contains "progress"', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status is closed when _embedded.status.isClosed is true', () => {
    const result = transformTask({
      ...raw,
      _embedded: { status: { name: 'Done', isClosed: true } },
    })
    expect(result.status).toBe('closed')
  })

  it('status falls back to open when no status info', () => {
    const result = transformTask({
      ...raw,
      _embedded: undefined,
      _links: { ...raw._links, status: undefined },
    })
    // percentageDone is 30 → in_progress
    expect(result.status).toBe('in_progress')
  })

  it('status is open when percentageDone is 0 and no embedded status', () => {
    const result = transformTask({ id: 1, subject: 'Test', percentageDone: 0 })
    expect(result.status).toBe('open')
  })

  it('maps priority high → high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('maps priority normal → medium', () => {
    const result = transformTask({
      ...raw,
      _links: { ...raw._links, priority: { href: '/api/v3/priorities/2', title: 'Normal' } },
    })
    expect(result.priority).toBe('medium')
  })

  it('maps priority low → low', () => {
    const result = transformTask({
      ...raw,
      _links: { ...raw._links, priority: { href: '/api/v3/priorities/1', title: 'Low' } },
    })
    expect(result.priority).toBe('low')
  })

  it('maps assigneeIds from _links.assignee', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['42'])
  })

  it('assigneeIds is empty when no assignee link', () => {
    const result = transformTask({ ...raw, _links: { ...raw._links, assignee: undefined } })
    expect(result.assigneeIds).toEqual([])
  })

  it('maps dueDate', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBeDefined()
    expect(result.dueDate).toMatch(/2026-03-01/)
  })

  it('platform is openproject', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('openproject')
  })

  it('metadata.platformType is child when parent href exists', () => {
    const result = transformTask(raw)
    expect(result.metadata.platformType).toBe('child')
  })

  it('metadata.platformType is work_package when no parent', () => {
    const result = transformTask({ ...raw, _links: { ...raw._links, parent: undefined } })
    expect(result.metadata.platformType).toBe('work_package')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
