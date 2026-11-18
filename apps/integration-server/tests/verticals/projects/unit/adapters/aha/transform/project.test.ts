import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawAhaRelease,
} from '../../../../../../../src/verticals/projects/adapters/aha/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('aha transformProject', () => {
  const raw: RawAhaRelease = {
    id: 'rel-456',
    reference_num: 'APP-R-1',
    name: 'Q1 Release',
    start_date: '2024-01-01',
    release_date: '2024-03-31',
    parking_lot: false,
    released: false,
    product_id: 'prod-10',
    owner: { id: 'usr-3', name: 'Bob' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  }

  it('maps id and externalId', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('rel-456')
    expect(result.externalId).toBe('rel-456')
  })

  it('workspaceId falls back to product_id when no arg given', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('prod-10')
  })

  it('caller-supplied workspaceId overrides product_id', () => {
    const result = transformProject(raw, 'ws-override')
    expect(result.workspaceId).toBe('ws-override')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Q1 Release')
  })

  it('status is active when neither released nor parking_lot', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is completed when released is true', () => {
    const result = transformProject({ ...raw, released: true })
    expect(result.status).toBe('completed')
  })

  it('status is on_hold when parking_lot is true', () => {
    const result = transformProject({ ...raw, parking_lot: true })
    expect(result.status).toBe('on_hold')
  })

  it('released takes priority over parking_lot', () => {
    const result = transformProject({ ...raw, released: true, parking_lot: true })
    expect(result.status).toBe('completed')
  })

  it('maps ownerId from owner.id', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('usr-3')
  })

  it('startDate maps from start_date', () => {
    const result = transformProject(raw)
    // start_date '2024-01-01' → ISO datetime
    expect(result.startDate).toBeDefined()
    expect(result.startDate!.startsWith('2024-01-01')).toBe(true)
  })

  it('endDate maps from release_date', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBeDefined()
    expect(result.endDate!.startsWith('2024-03-31')).toBe(true)
  })

  it('platform is aha', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('aha')
  })

  it('metadata.referenceNum is set', () => {
    const result = transformProject(raw)
    expect(result.metadata.referenceNum).toBe('APP-R-1')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('ownerId is undefined when owner is absent', () => {
    const result = transformProject({ id: 'r1', name: 'R1' })
    expect(result.ownerId).toBeUndefined()
  })
})
