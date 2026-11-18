import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawProductplanBar,
} from '../../../../../../../src/verticals/projects/adapters/productplan/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('productplan transformTask', () => {
  const raw: RawProductplanBar = {
    id: 500,
    name: 'Launch v2',
    description: 'Major version release.',
    notes: 'Detailed planning notes.',
    starts_on: '2025-04-01',
    ends_on: '2025-06-30',
    percent_done: 40,
    parked: false,
    container: false,
    effort: 8,
    updated_at: '2025-05-20T10:00:00.000Z',
    lane: { id: 10, value: 'Q2' },
    parent: { id: 400, name: 'Epic Feature' },
    tags: [
      { id: 1, value: 'alpha' },
      { id: 2, value: 'beta' },
    ],
  }

  it('maps id as string', () => {
    const result = transformTask(raw, 'road-1')
    expect(result.id).toBe('500')
    expect(result.externalId).toBe('500')
  })

  it('maps title from name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Launch v2')
  })

  it('maps description from description field', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Major version release.')
  })

  it('falls back to notes when description is absent', () => {
    const noDesc: RawProductplanBar = { id: 1, notes: 'some notes' }
    const result = transformTask(noDesc)
    expect(result.description).toBe('some notes')
  })

  it('status is open for partial progress', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when percent_done is 100', () => {
    const result = transformTask({ ...raw, percent_done: 100 })
    expect(result.status).toBe('closed')
  })

  it('status is on_hold when parked=true', () => {
    const result = transformTask({ ...raw, parked: true })
    expect(result.status).toBe('on_hold')
  })

  it('projectId comes from roadmapId argument', () => {
    const result = transformTask(raw, 'road-99')
    expect(result.projectId).toBe('road-99')
  })

  it('projectId defaults to empty string when argument omitted', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('')
  })

  it('parentId comes from parent.id as string', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('400')
  })

  it('dueDate comes from ends_on', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe(new Date('2025-06-30').toISOString())
  })

  it('tagIds are extracted from tags array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['1', '2'])
  })

  it('updatedAt is ISO 8601', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBe('2025-05-20T10:00:00.000Z')
  })

  it('platform is productplan', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('productplan')
  })

  it('metadata includes laneId and effort', () => {
    const result = transformTask(raw)
    expect(result.metadata.laneId).toBe('10')
    expect(result.metadata.effort).toBe('8')
  })

  it('metadata includes startsOn', () => {
    const result = transformTask(raw)
    expect(result.metadata.startsOn).toBe('2025-04-01')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw, 'road-1')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
