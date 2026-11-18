import { describe, it, expect } from 'vitest'
import { transformProject } from '../../../../../../../src/verticals/projects/adapters/twproject/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'
import { TASK_GET, TASK_LIST } from '../fixtures/documented-samples'

describe('twproject transformProject (documented task response example)', () => {
  const raw = TASK_LIST.objects[0]!

  it('parses as a canonical Project', () => {
    const p = ProjectSchema.parse(transformProject(raw))
    expect(p).toMatchObject({
      id: '7923',
      externalId: '7923',
      workspaceId: '',
      name: 'Green power plant v2',
      description: 'With this project we will ...',
      status: 'active',
      platform: 'twproject',
    })
  })

  it('reads start/end/creationDate/lastModified as epoch milliseconds', () => {
    const p = transformProject(raw)
    expect(p.startDate).toBe(new Date(1514761200000).toISOString())
    expect(p.endDate).toBe(new Date(1518217199998).toISOString())
    expect(p.createdAt).toBe(new Date(1525263157861).toISOString())
    expect(p.updatedAt).toBe(new Date(1525263262653).toISOString())
  })

  it('keeps the documented status, code, tags and progress in metadata', () => {
    expect(transformProject(raw).metadata).toEqual({
      status: 'STATUS_ACTIVE',
      code: 'GPP',
      tags: 'global, green, fuelcell',
      progress: '30',
    })
  })

  it.each([
    ['STATUS_ACTIVE', 'active'],
    ['STATUS_SUSPENDED', 'on_hold'],
    ['STATUS_DONE', 'completed'],
    ['STATUS_WAITING', 'unknown'],
    ['STATUS_FAILED', 'unknown'],
    ['STATUS_UNDEFINED', 'unknown'],
  ])('maps taskStatusType %s to %s', (status, expected) => {
    expect(ProjectSchema.parse(transformProject({ ...raw, status })).status).toBe(expected)
  })

  it('parses the documented get example too', () => {
    expect(ProjectSchema.parse(transformProject(TASK_GET.object)).id).toBe('7923')
  })

  it('throws on a task with no name rather than inventing one', () => {
    expect(() => transformProject({ id: '1' })).toThrow(/no name/)
  })
})
