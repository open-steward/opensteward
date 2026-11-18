import { describe, it, expect } from 'vitest'
import {
  transformArtifact,
  type RawTuleapArtifact,
} from '../../../../../../../src/verticals/projects/adapters/tuleap/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('tuleap transformArtifact', () => {
  // Tuleap fields are dynamic. We use values_by_field for deterministic access.
  const raw: RawTuleapArtifact = {
    id: 1433,
    uri: 'artifacts/1433',
    tracker: {
      id: 50,
      uri: 'trackers/50',
      label: 'Bugs',
      item_name: 'bug',
      project: { id: 110, uri: 'projects/110', label: 'Alpha' },
    },
    submitted_by: 42,
    submitted_on: '2024-02-01T09:00:00.000Z',
    last_update_date: '2024-02-10T15:00:00.000Z',
    html_url: 'https://tuleap.example.com/plugins/tracker/?aid=1433',
    changesets_uri: 'artifacts/1433/changesets',
    values_by_field: {
      summary: { field_id: 1, label: 'Summary', type: 'string', value: 'Fix login timeout' },
      status: { field_id: 2, label: 'Status', type: 'list', value: 'in progress' },
      priority: { field_id: 3, label: 'Priority', type: 'list', value: 'major' },
      assigned_to: {
        field_id: 4,
        label: 'Assigned to',
        type: 'subm',
        value: { id: 77, display_name: 'Bob Dev' },
      },
      due_date: { field_id: 5, label: 'Due Date', type: 'date', value: '2024-03-01T00:00:00.000Z' },
    },
    values: [],
  }

  it('maps id and externalId from raw.id as string', () => {
    const result = transformArtifact(raw)
    expect(result.id).toBe('1433')
    expect(result.externalId).toBe('1433')
  })

  it('extracts title from values_by_field.summary', () => {
    const result = transformArtifact(raw)
    expect(result.title).toBe('Fix login timeout')
  })

  it('status maps "in progress" to in_progress', () => {
    const result = transformArtifact(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status maps "done" to closed', () => {
    const r: RawTuleapArtifact = {
      ...raw,
      values_by_field: {
        ...raw.values_by_field,
        status: { field_id: 2, label: 'Status', type: 'list', value: 'done' },
      },
    }
    expect(transformArtifact(r).status).toBe('closed')
  })

  it('status maps "resolved" to closed', () => {
    const r: RawTuleapArtifact = {
      ...raw,
      values_by_field: {
        ...raw.values_by_field,
        status: { field_id: 2, label: 'Status', type: 'list', value: 'resolved' },
      },
    }
    expect(transformArtifact(r).status).toBe('closed')
  })

  it('status defaults to open when status field absent', () => {
    const r: RawTuleapArtifact = { ...raw, values_by_field: {}, values: [] }
    expect(transformArtifact(r).status).toBe('open')
  })

  it('priority maps "major" to high', () => {
    const result = transformArtifact(raw)
    expect(result.priority).toBe('high')
  })

  it('priority maps "critical" to urgent', () => {
    const r: RawTuleapArtifact = {
      ...raw,
      values_by_field: {
        ...raw.values_by_field,
        priority: { field_id: 3, label: 'Priority', type: 'list', value: 'critical' },
      },
    }
    expect(transformArtifact(r).priority).toBe('urgent')
  })

  it('priority maps "normal" to medium', () => {
    const r: RawTuleapArtifact = {
      ...raw,
      values_by_field: {
        ...raw.values_by_field,
        priority: { field_id: 3, label: 'Priority', type: 'list', value: 'normal' },
      },
    }
    expect(transformArtifact(r).priority).toBe('medium')
  })

  it('priority is undefined when field absent', () => {
    const r: RawTuleapArtifact = { ...raw, values_by_field: {}, values: [] }
    expect(transformArtifact(r).priority).toBeUndefined()
  })

  it('projectId uses caller-supplied arg', () => {
    const result = transformArtifact(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('projectId falls back to tracker.project.id as string', () => {
    const result = transformArtifact(raw)
    expect(result.projectId).toBe('110')
  })

  it('assigneeIds extracts from assigned_to user field', () => {
    const result = transformArtifact(raw)
    expect(result.assigneeIds).toEqual(['77'])
  })

  it('assigneeIds is empty when assigned_to absent', () => {
    const r: RawTuleapArtifact = { ...raw, values_by_field: {}, values: [] }
    expect(transformArtifact(r).assigneeIds).toEqual([])
  })

  it('dueDate extracted from due_date field', () => {
    const result = transformArtifact(raw)
    expect(result.dueDate).toBe(new Date('2024-03-01T00:00:00.000Z').toISOString())
  })

  it('createdAt from submitted_on', () => {
    const result = transformArtifact(raw)
    expect(result.createdAt).toBe(new Date('2024-02-01T09:00:00.000Z').toISOString())
  })

  it('updatedAt from last_update_date', () => {
    const result = transformArtifact(raw)
    expect(result.updatedAt).toBe(new Date('2024-02-10T15:00:00.000Z').toISOString())
  })

  it('tagIds is always empty', () => {
    const result = transformArtifact(raw)
    expect(result.tagIds).toEqual([])
  })

  it('platform is tuleap', () => {
    const result = transformArtifact(raw)
    expect(result.platform).toBe('tuleap')
  })

  it('metadata stores trackerId as string', () => {
    const result = transformArtifact(raw)
    expect(result.metadata['trackerId']).toBe('50')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformArtifact(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('extracts title via values array fallback when values_by_field absent', () => {
    const r: RawTuleapArtifact = {
      id: 999,
      submitted_by: 1,
      submitted_on: '2024-01-01T00:00:00.000Z',
      values: [{ field_id: 1, label: 'Summary', type: 'string', value: 'Fallback title' }],
    }
    const result = transformArtifact(r)
    expect(result.title).toBe('Fallback title')
  })
})
