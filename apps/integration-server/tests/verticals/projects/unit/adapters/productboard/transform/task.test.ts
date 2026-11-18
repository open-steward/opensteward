import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawProductboardFeature,
} from '../../../../../../../src/verticals/projects/adapters/productboard/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('productboard transformTask', () => {
  const raw: RawProductboardFeature = {
    id: 'feat-77',
    name: 'Dark mode',
    description: 'Add dark mode to the dashboard.',
    type: 'feature',
    status: { id: 'status-1', name: 'In progress' },
    parent: {
      product: {
        id: 'prod-10',
        name: 'Mobile App',
        links: { self: 'https://api.productboard.com/products/prod-10' },
      },
    },
    owner: { email: 'eng@example.com' },
    timeframe: { startDate: '2025-02-01', endDate: '2025-03-31', granularity: 'month' },
    archived: false,
    createdAt: '2025-01-05T08:00:00.000Z',
    updatedAt: '2025-02-14T17:30:00.000Z',
    links: { html: 'https://app.productboard.com/f/feat-77' },
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('feat-77')
    expect(result.externalId).toBe('feat-77')
  })

  it('maps title from name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Dark mode')
  })

  it('maps description correctly', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Add dark mode to the dashboard.')
  })

  it('status in_progress when status name includes "progress"', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status closed when archived=true', () => {
    const result = transformTask({ ...raw, archived: true })
    expect(result.status).toBe('closed')
  })

  it('status closed when status name includes "done"', () => {
    const result = transformTask({ ...raw, status: { name: 'Done' } })
    expect(result.status).toBe('closed')
  })

  it('status open for unknown status name', () => {
    const result = transformTask({ ...raw, status: { name: 'Planned' } })
    expect(result.status).toBe('open')
  })

  it('projectId uses explicit argument over parent', () => {
    const result = transformTask(raw, 'explicit-proj')
    expect(result.projectId).toBe('explicit-proj')
  })

  it('projectId falls back to parent.product.id', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('prod-10')
  })

  it('parentId is undefined for a regular feature', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('parentId is set for a subfeature with parent.feature', () => {
    const sub: RawProductboardFeature = {
      ...raw,
      type: 'subfeature',
      parent: { feature: { id: 'feat-parent', name: 'Parent Feature' } },
    }
    const result = transformTask(sub)
    expect(result.parentId).toBe('feat-parent')
  })

  it('dueDate comes from timeframe.endDate', () => {
    const result = transformTask(raw)
    // toIso converts '2025-03-31' → ISO midnight UTC
    expect(result.dueDate).toBe(new Date('2025-03-31').toISOString())
  })

  it('createdAt and updatedAt are ISO 8601', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2025-01-05T08:00:00.000Z')
    expect(result.updatedAt).toBe('2025-02-14T17:30:00.000Z')
  })

  it('platform is productboard', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('productboard')
  })

  it('metadata includes statusName and htmlUrl', () => {
    const result = transformTask(raw)
    expect(result.metadata.statusName).toBe('In progress')
    expect(result.metadata.htmlUrl).toBe('https://app.productboard.com/f/feat-77')
  })

  it('metadata platformType is feature for normal feature', () => {
    const result = transformTask(raw)
    expect(result.metadata.platformType).toBe('feature')
  })

  it('metadata platformType is subfeature for subfeature type', () => {
    const result = transformTask({ ...raw, type: 'subfeature', parent: { feature: { id: 'f-p' } } })
    expect(result.metadata.platformType).toBe('subfeature')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
