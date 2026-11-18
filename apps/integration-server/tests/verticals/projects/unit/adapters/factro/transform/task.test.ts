import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawFactroPackage,
} from '../../../../../../../src/verticals/projects/adapters/factro/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('factro transformTask', () => {
  const raw: RawFactroPackage = {
    id: 'pkg-500',
    title: 'Build API Gateway',
    description: 'Implement rate limiting and routing.',
    startDate: '2024-03-01T00:00:00.000Z',
    endDate: '2024-04-01T00:00:00.000Z',
    creationDate: '2024-02-15T08:00:00.000Z',
    changeDate: '2024-03-10T14:00:00.000Z',
    officerId: 'user-dev',
    projectId: 'proj-42',
    parentPackageId: 'pkg-parent-1',
    plannedEffort: 40,
    realizedEffort: 10,
    remainingEffort: 30,
    number: 5,
    mandantId: 'mandant-1',
  }

  it('maps id and externalId', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('pkg-500')
    expect(result.externalId).toBe('pkg-500')
  })

  it('maps projectId from raw.projectId when no arg given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj-42')
  })

  it('caller-supplied projectId overrides raw.projectId', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('maps title', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Build API Gateway')
  })

  it('maps description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Implement rate limiting and routing.')
  })

  it('status is open when realized effort < planned effort', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when realizedEffort >= plannedEffort and plannedEffort > 0', () => {
    const result = transformTask({ ...raw, realizedEffort: 40, plannedEffort: 40 })
    expect(result.status).toBe('closed')
  })

  it('status is open when plannedEffort is 0', () => {
    const result = transformTask({ ...raw, realizedEffort: 5, plannedEffort: 0 })
    expect(result.status).toBe('open')
  })

  it('priority is always undefined (no explicit priority on packages)', () => {
    const result = transformTask(raw)
    expect(result.priority).toBeUndefined()
  })

  it('maps parentId from parentPackageId', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('pkg-parent-1')
  })

  it('parentId is undefined when parentPackageId is absent', () => {
    const result = transformTask({ ...raw, parentPackageId: undefined })
    expect(result.parentId).toBeUndefined()
  })

  it('assigneeIds contains officerId', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['user-dev'])
  })

  it('assigneeIds is empty when officerId is absent', () => {
    const result = transformTask({ ...raw, officerId: undefined })
    expect(result.assigneeIds).toEqual([])
  })

  it('dueDate parses from endDate', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-04-01T00:00:00.000Z')
  })

  it('createdAt parses from creationDate', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2024-02-15T08:00:00.000Z')
  })

  it('platform is factro', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('factro')
  })

  it('metadata.plannedEffort reflects plannedEffort', () => {
    const result = transformTask(raw)
    expect(result.metadata.plannedEffort).toBe('40')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
