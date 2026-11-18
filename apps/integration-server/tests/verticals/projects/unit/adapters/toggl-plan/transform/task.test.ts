import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawTogglPlanTask,
} from '../../../../../../../src/verticals/projects/adapters/toggl-plan/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('toggl-plan transformTask', () => {
  const raw: RawTogglPlanTask = {
    id: 8001,
    name: 'Design mockups',
    notes: 'Create Figma prototypes for all screens.',
    // Toggl Plan uses YYYY-MM-DD plain date strings (not ISO datetimes)
    start_date: '2024-02-01',
    end_date: '2024-02-15',
    start_time: '09:00',
    end_time: '17:00',
    status: 'active',
    workspace_members: [101, 202],
    tag_ids: [30, 40],
    folder_id: 5001,
    color: '#3b82f6',
    color_id: 7,
    estimated_hours: '8',
    estimated_minutes: 30,
    created_at: '2024-01-20T10:00:00.000Z',
    updated_at: '2024-01-25T12:00:00.000Z',
  }

  it('maps id and externalId from raw.id as string', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('8001')
    expect(result.externalId).toBe('8001')
  })

  it('maps title from name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Design mockups')
  })

  it('maps description from notes', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Create Figma prototypes for all screens.')
  })

  it('status is open for non-done status', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when status is done (case-insensitive)', () => {
    const result = transformTask({ ...raw, status: 'done' })
    expect(result.status).toBe('closed')
  })

  it('status is closed when status is DONE uppercase', () => {
    const result = transformTask({ ...raw, status: 'DONE' })
    expect(result.status).toBe('closed')
  })

  it('projectId uses caller-supplied arg', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('projectId is empty string when no arg', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('')
  })

  it('dueDate is derived from end_date (YYYY-MM-DD → ISO)', () => {
    const result = transformTask(raw)
    // toIso parses '2024-02-15' as a date string
    expect(result.dueDate).toBe(new Date('2024-02-15').toISOString())
  })

  it('assigneeIds maps workspace_members numeric array to strings', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['101', '202'])
  })

  it('assigneeIds is empty when workspace_members absent', () => {
    const result = transformTask({ ...raw, workspace_members: undefined })
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds maps tag_ids numeric array to strings', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['30', '40'])
  })

  it('parentId is always undefined', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('platform is toggl-plan', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('toggl-plan')
  })

  it('metadata stores startDate (not promoted to canonical)', () => {
    const result = transformTask(raw)
    expect(result.metadata['startDate']).toBe('2024-02-01')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
