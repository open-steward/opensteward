import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawProcessStreetComment,
} from '../../../../../../../src/verticals/projects/adapters/process-street/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('process-street transformComment', () => {
  const raw: RawProcessStreetComment = {
    id: 'cmt-abc-789',
    workflowRunId: 'run-xyz-789',
    taskId: 'task-abc-456',
    body: 'Step completed successfully.',
    authorId: 'usr-99',
    createdAt: '2026-02-20T14:00:00.000Z',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('cmt-abc-789')
    expect(result.externalId).toBe('cmt-abc-789')
  })

  it('body from raw.body', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Step completed successfully.')
  })

  it('body defaults to empty string when body absent', () => {
    const result = transformComment({ ...raw, body: undefined })
    expect(result.body).toBe('')
  })

  it('authorId from raw.authorId', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('usr-99')
  })

  it('authorId defaults to empty string when authorId absent', () => {
    const result = transformComment({ ...raw, authorId: undefined })
    expect(result.authorId).toBe('')
  })

  it('taskId resolved from raw.taskId when no arg given', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('task-abc-456')
  })

  it('taskId uses explicit arg over raw.taskId', () => {
    const result = transformComment(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('projectId (workflowRunId) resolved from raw.workflowRunId when no arg given', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('run-xyz-789')
  })

  it('projectId uses explicit workflowRunId arg over raw.workflowRunId', () => {
    const result = transformComment(raw, undefined, 'run-override')
    expect(result.projectId).toBe('run-override')
  })

  it('mentions is empty array', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual([])
  })

  it('attachmentCount is 0', () => {
    const result = transformComment(raw)
    expect(result.attachmentCount).toBe(0)
  })

  it('createdAt from raw.createdAt', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2026-02-20T14:00:00.000Z')
  })

  it('createdAt falls back to epoch when createdAt absent', () => {
    const result = transformComment({ ...raw, createdAt: undefined })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('metadata.workflowRunId reflects resolved run id', () => {
    const result = transformComment(raw)
    expect(result.metadata.workflowRunId).toBe('run-xyz-789')
  })

  it('platform is process-street', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('process-street')
  })

  it('raw is preserved on output', () => {
    const result = transformComment(raw)
    expect(result.raw).toBe(raw)
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
