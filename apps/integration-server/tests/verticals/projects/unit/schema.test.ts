import { describe, it, expect } from 'vitest'
import {
  ProjectSchema,
  TaskSchema,
  CommentSchema,
  TagSchema,
  WorkspaceSchema,
  UserSchema,
  WebhookEventSchema,
} from '../../../../src/verticals/projects/schema'

describe('projects canonical schemas', () => {
  it('parses a minimal Project', () => {
    const parsed = ProjectSchema.parse({
      id: 'p1',
      externalId: 'p1',
      workspaceId: 'w1',
      name: 'Acme website',
      status: 'active',
      platform: 'asana',
      metadata: {},
    })
    expect(parsed.status).toBe('active')
  })

  it('parses a Task with parentId (hierarchy flat-with-parent-pointer)', () => {
    const parsed = TaskSchema.parse({
      id: 't1',
      externalId: 't1',
      projectId: 'p1',
      parentId: 'epic1',
      title: 'Build the page',
      status: 'in_progress',
      assigneeIds: ['u1'],
      tagIds: [],
      platform: 'jira',
      metadata: { platformType: 'story' },
    })
    expect(parsed.parentId).toBe('epic1')
    expect(parsed.metadata.platformType).toBe('story')
  })

  it('Task schema has no `attachmentContent` field — refused at schema level', () => {
    const parsed = TaskSchema.parse({
      id: 't1', externalId: 't1', projectId: 'p1', title: 'X', status: 'open',
      assigneeIds: [], tagIds: [], platform: 'asana', metadata: {},
      attachmentContent: 'malicious',
    } as unknown as Record<string, unknown>)
    expect((parsed as Record<string, unknown>)['attachmentContent']).toBeUndefined()
  })

  it('Comment includes body but no attachment-content field', () => {
    const parsed = CommentSchema.parse({
      id: 'c1', externalId: 'c1', taskId: 't1',
      authorId: 'u1', body: 'looks good', mentions: [],
      attachmentCount: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      platform: 'asana', metadata: {},
    })
    expect(parsed.body).toBe('looks good')
    expect(parsed.attachmentCount).toBe(2)
    expect((parsed as Record<string, unknown>)['attachmentContent']).toBeUndefined()
  })

  it('parses Tag / Workspace / User / WebhookEvent', () => {
    expect(TagSchema.parse({ id: 'tg1', externalId: 'tg1', workspaceId: 'w1', name: 'urgent', platform: 'asana', metadata: {} }).name).toBe('urgent')
    expect(WorkspaceSchema.parse({ id: 'w1', externalId: 'w1', name: 'Acme', platform: 'asana', metadata: {} }).name).toBe('Acme')
    expect(UserSchema.parse({ id: 'u1', externalId: 'u1', name: 'Alice', workspaceIds: ['w1'], platform: 'asana', metadata: {} }).name).toBe('Alice')
    expect(WebhookEventSchema.parse({ platform: 'asana', type: 'task.changed', resourceType: 'tasks', action: 'updated', resourceId: 't1', payload: {} }).action).toBe('updated')
  })
})
