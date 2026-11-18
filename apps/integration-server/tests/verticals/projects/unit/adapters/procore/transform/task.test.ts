import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawProcoreRfi,
} from '../../../../../../../src/verticals/projects/adapters/procore/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('procore transformTask (RFI)', () => {
  const raw: RawProcoreRfi = {
    id: 101,
    subject: 'What material spec for column C4?',
    number: '001',
    full_number: 'RFI-001',
    status: 'open',
    priority: 'high',
    body: 'Please clarify the steel grade for column C4.',
    due_date: '2026-03-15T00:00:00.000Z',
    created_at: '2026-01-10T08:00:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    private: false,
    assignees: [{ id: 55 }, { id: 66 }],
    assignee: { id: 77 },
  }

  it('maps id and externalId to string of numeric id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('title from raw.subject', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('What material spec for column C4?')
  })

  it('description from raw.body when body is present', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Please clarify the steel grade for column C4.')
  })

  it('description falls back to question.body when body absent', () => {
    const result = transformTask({
      ...raw,
      body: undefined,
      question: { body: 'Question body text' },
    })
    expect(result.description).toBe('Question body text')
  })

  it('description falls back to questions[0].plain_text_body', () => {
    const result = transformTask({
      ...raw,
      body: undefined,
      question: undefined,
      questions: [{ plain_text_body: 'Plain question text', body: 'Rich text' }],
    })
    expect(result.description).toBe('Plain question text')
  })

  it('description falls back to questions[0].body when plain_text_body absent', () => {
    const result = transformTask({
      ...raw,
      body: undefined,
      question: undefined,
      questions: [{ body: 'Only rich text' }],
    })
    expect(result.description).toBe('Only rich text')
  })

  it('projectId from explicit arg', () => {
    const result = transformTask(raw, 'proj-500')
    expect(result.projectId).toBe('proj-500')
  })

  it('projectId is empty string when no arg given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('')
  })

  it('status "open" → in_progress', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status "closed" → closed', () => {
    const result = transformTask({ ...raw, status: 'closed' })
    expect(result.status).toBe('closed')
  })

  it('status "draft" → open', () => {
    const result = transformTask({ ...raw, status: 'draft' })
    expect(result.status).toBe('open')
  })

  it('status defaults to open for unknown status', () => {
    const result = transformTask({ ...raw, status: 'unknown_status' })
    expect(result.status).toBe('open')
  })

  it('priority "high" → high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority "urgent" → urgent', () => {
    const result = transformTask({ ...raw, priority: 'urgent' })
    expect(result.priority).toBe('urgent')
  })

  it('priority "medium" → medium', () => {
    const result = transformTask({ ...raw, priority: 'medium' })
    expect(result.priority).toBe('medium')
  })

  it('priority "normal" → medium', () => {
    const result = transformTask({ ...raw, priority: 'normal' })
    expect(result.priority).toBe('medium')
  })

  it('priority "low" → low', () => {
    const result = transformTask({ ...raw, priority: 'low' })
    expect(result.priority).toBe('low')
  })

  it('priority is undefined when absent', () => {
    const result = transformTask({ ...raw, priority: undefined })
    expect(result.priority).toBeUndefined()
  })

  it('assigneeIds from assignees array + assignee, deduped', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toContain('55')
    expect(result.assigneeIds).toContain('66')
    expect(result.assigneeIds).toContain('77')
    // Should be unique (no duplicates)
    expect(new Set(result.assigneeIds).size).toBe(result.assigneeIds.length)
  })

  it('assigneeIds deduplicates overlapping assignees and assignee', () => {
    const result = transformTask({ ...raw, assignees: [{ id: 55 }], assignee: { id: 55 } })
    expect(result.assigneeIds).toEqual(['55'])
  })

  it('dueDate from due_date', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2026-03-15T00:00:00.000Z')
  })

  it('createdAt from created_at', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2026-01-10T08:00:00.000Z')
  })

  it('updatedAt from updated_at', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('tagIds is empty array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('parentId is undefined (RFIs are flat)', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('metadata.platformType is rfi', () => {
    const result = transformTask(raw)
    expect(result.metadata.platformType).toBe('rfi')
  })

  it('metadata.number prefers full_number', () => {
    const result = transformTask(raw)
    expect(result.metadata.number).toBe('RFI-001')
  })

  it('metadata.number falls back to number when full_number absent', () => {
    const result = transformTask({ ...raw, full_number: undefined })
    expect(result.metadata.number).toBe('001')
  })

  it('metadata.private from raw.private', () => {
    const result = transformTask(raw)
    expect(result.metadata.private).toBe('false')
  })

  it('platform is procore', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('procore')
  })

  it('raw is preserved on output', () => {
    const result = transformTask(raw)
    expect(result.raw).toBe(raw)
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw, 'proj-500')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
