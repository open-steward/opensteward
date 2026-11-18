import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawZenhubIssue,
} from '../../../../../../../src/verticals/projects/adapters/zenhub/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('zenhub transformTask', () => {
  const raw: RawZenhubIssue = {
    id: 'issue-zhb-1',
    number: 42,
    title: 'Implement OAuth flow',
    body: 'Full description here.',
    state: 'OPEN',
    pullRequest: false,
    type: 'ISSUE',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-02-01T14:00:00.000Z',
    closedAt: undefined,
    ghId: 999,
    ghNodeId: 'MDExOlB1bGxSZXF1ZXN0',
    assignees: {
      nodes: [
        { id: 'user-a', login: 'alice', name: 'Alice' },
        { id: 'user-b', login: 'bob', name: 'Bob' },
      ],
    },
    labels: {
      nodes: [
        { id: 'label-1', name: 'bug', color: 'ee0701' },
        { id: 'label-2', name: 'help wanted', color: '0075ca' },
      ],
    },
    estimate: { value: 3 },
    pipelineIssue: {
      pipeline: { id: 'pipe-1', name: 'In Progress' },
      priority: 1,
    },
    repository: { id: 'repo-1', ghId: 123, name: 'my-repo' },
  }

  it('maps id and externalId', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('issue-zhb-1')
    expect(result.externalId).toBe('issue-zhb-1')
  })

  it('maps title', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Implement OAuth flow')
  })

  it('maps description from body', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Full description here.')
  })

  it('maps projectId from argument when provided', () => {
    const result = transformTask(raw, 'override-repo')
    expect(result.projectId).toBe('override-repo')
  })

  it('maps projectId from repository.id when argument absent', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('repo-1')
  })

  it('projectId is empty string when repository absent and no arg', () => {
    const result = transformTask({ ...raw, repository: null })
    expect(result.projectId).toBe('')
  })

  it('maps assigneeIds from assignees.nodes', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['user-a', 'user-b'])
  })

  it('assigneeIds is empty when assignees absent', () => {
    const result = transformTask({ ...raw, assignees: undefined })
    expect(result.assigneeIds).toEqual([])
  })

  it('maps tagIds from labels.nodes', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['label-1', 'label-2'])
  })

  it('tagIds is empty when labels absent', () => {
    const result = transformTask({ ...raw, labels: undefined })
    expect(result.tagIds).toEqual([])
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-01T14:00:00.000Z')
  })

  it('maps dueDate from closedAt', () => {
    const result = transformTask({ ...raw, closedAt: '2024-03-01T00:00:00.000Z' })
    expect(result.dueDate).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is zenhub', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('zenhub')
  })

  it('metadata includes number, pullRequest, type, pipelineId', () => {
    const result = transformTask(raw)
    expect(result.metadata.number).toBe('42')
    expect(result.metadata.pullRequest).toBe('false')
    expect(result.metadata.type).toBe('ISSUE')
    expect(result.metadata.pipelineId).toBe('pipe-1')
    expect(result.metadata.pipelineName).toBe('In Progress')
  })

  describe('status mapping', () => {
    it('CLOSED maps to closed', () => {
      const result = transformTask({ ...raw, state: 'CLOSED' })
      expect(result.status).toBe('closed')
    })

    it('OPEN maps to open', () => {
      const result = transformTask({ ...raw, state: 'OPEN' })
      expect(result.status).toBe('open')
    })

    it('absent state maps to open', () => {
      const result = transformTask({ ...raw, state: undefined })
      expect(result.status).toBe('open')
    })
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
