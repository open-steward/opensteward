import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawRocketlaneTask,
} from '../../../../../../../src/verticals/projects/adapters/rocketlane/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('rocketlane transformTask', () => {
  const raw: RawRocketlaneTask = {
    taskId: 201,
    taskName: 'Kickoff call',
    description: 'Initial onboarding call with the customer.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    projectId: 42,
    phaseId: 10,
    parentTaskId: null,
    startDate: '2026-01-15T00:00:00Z',
    dueDate: '2026-01-20T00:00:00Z',
    progress: 30,
    assignees: [{ userId: 7 }, { userId: 8 }],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-10T00:00:00Z',
  }

  it('maps taskId to id as string', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('201')
  })

  it('sets externalId equal to id', () => {
    const result = transformTask(raw)
    expect(result.externalId).toBe(result.id)
  })

  it('maps projectId from raw when no arg provided', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('42')
  })

  it('overrides projectId from arg when provided', () => {
    const result = transformTask(raw, 'proj_override')
    expect(result.projectId).toBe('proj_override')
  })

  it('projectId is empty string when neither arg nor raw.projectId is present', () => {
    const result = transformTask({ taskId: 1 })
    expect(result.projectId).toBe('')
  })

  it('maps parentTaskId when present', () => {
    const result = transformTask({ ...raw, parentTaskId: 100 })
    expect(result.parentId).toBe('100')
  })

  it('parentId is undefined when parentTaskId is null', () => {
    const result = transformTask(raw) // parentTaskId: null
    expect(result.parentId).toBeUndefined()
  })

  it('parentId is undefined when parentTaskId is absent', () => {
    const result = transformTask({ taskId: 1 })
    expect(result.parentId).toBeUndefined()
  })

  it('maps taskName to title', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Kickoff call')
  })

  it('title is empty string when taskName is absent', () => {
    const result = transformTask({ taskId: 1 })
    expect(result.title).toBe('')
  })

  it('maps description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Initial onboarding call with the customer.')
  })

  it('description is undefined when absent', () => {
    const result = transformTask({ taskId: 1 })
    expect(result.description).toBeUndefined()
  })

  it('maps dueDate to ISO string', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2026-01-20T00:00:00.000Z')
  })

  it('dueDate is undefined when absent', () => {
    const result = transformTask({ taskId: 1 })
    expect(result.dueDate).toBeUndefined()
  })

  it('maps assignees[].userId to assigneeIds array of strings', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['7', '8'])
  })

  it('filters out assignees with no userId', () => {
    const result = transformTask({ ...raw, assignees: [{ userId: 5 }, {}, { userId: 6 }] })
    expect(result.assigneeIds).toEqual(['5', '6'])
  })

  it('assigneeIds is empty array when assignees is absent', () => {
    const result = transformTask({ taskId: 1 })
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds is always an empty array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('platform is rocketlane', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('rocketlane')
  })

  it('metadata contains phaseId as string', () => {
    const result = transformTask(raw)
    expect(result.metadata.phaseId).toBe('10')
  })

  it('metadata contains raw status string', () => {
    const result = transformTask(raw)
    expect(result.metadata.status).toBe('IN_PROGRESS')
  })

  it('metadata contains raw priority string', () => {
    const result = transformTask(raw)
    expect(result.metadata.priority).toBe('HIGH')
  })

  it('metadata contains progress as string', () => {
    const result = transformTask(raw)
    expect(result.metadata.progress).toBe('30')
  })

  it('preserves the original raw payload', () => {
    const result = transformTask(raw)
    expect(result.raw).toBe(raw)
  })

  // --- status mapping ---

  it("maps status 'IN_PROGRESS' to 'in_progress'", () => {
    const result = transformTask({ ...raw, status: 'IN_PROGRESS' })
    expect(result.status).toBe('in_progress')
  })

  it("maps status 'DONE' to 'closed'", () => {
    const result = transformTask({ ...raw, status: 'DONE' })
    expect(result.status).toBe('closed')
  })

  it("maps status 'COMPLETED' to 'closed'", () => {
    const result = transformTask({ ...raw, status: 'COMPLETED' })
    expect(result.status).toBe('closed')
  })

  it("maps unknown/missing status to 'open' (default branch)", () => {
    const result = transformTask({ ...raw, status: 'TODO' })
    expect(result.status).toBe('open')
  })

  it("maps absent status to 'open' (default branch)", () => {
    const result = transformTask({ taskId: 1 })
    expect(result.status).toBe('open')
  })

  it("maps status 'BLOCKED' to 'in_progress' (blocked task is in-flight but stuck)", () => {
    const result = transformTask({ ...raw, status: 'BLOCKED' })
    expect(result.status).toBe('in_progress')
    expect(result.metadata.status).toBe('BLOCKED')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  // --- priority mapping ---

  it("maps priority 'HIGH' to 'high'", () => {
    const result = transformTask({ ...raw, priority: 'HIGH' })
    expect(result.priority).toBe('high')
  })

  it("maps priority 'URGENT' to 'urgent'", () => {
    const result = transformTask({ ...raw, priority: 'URGENT' })
    expect(result.priority).toBe('urgent')
  })

  it("maps priority 'CRITICAL' to 'urgent'", () => {
    const result = transformTask({ ...raw, priority: 'CRITICAL' })
    expect(result.priority).toBe('urgent')
  })

  it("maps priority 'MEDIUM' to 'medium'", () => {
    const result = transformTask({ ...raw, priority: 'MEDIUM' })
    expect(result.priority).toBe('medium')
  })

  it("maps priority 'NORMAL' to 'medium'", () => {
    const result = transformTask({ ...raw, priority: 'NORMAL' })
    expect(result.priority).toBe('medium')
  })

  it("maps priority 'LOW' to 'low'", () => {
    const result = transformTask({ ...raw, priority: 'LOW' })
    expect(result.priority).toBe('low')
  })

  it('priority is undefined when absent or unrecognised', () => {
    const result = transformTask({ ...raw, priority: 'UNKNOWN_LEVEL' })
    expect(result.priority).toBeUndefined()
  })

  it('priority is undefined when priority field is absent', () => {
    const result = transformTask({ taskId: 1 })
    expect(result.priority).toBeUndefined()
  })

  // --- schema parse ---

  it("passes TaskSchema.parse for 'IN_PROGRESS' status", () => {
    const result = transformTask({ ...raw, status: 'IN_PROGRESS' })
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it("passes TaskSchema.parse for 'DONE' status mapped to 'closed'", () => {
    const result = transformTask({ ...raw, status: 'DONE' })
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('passes TaskSchema.parse for a minimal task (id only, open status, no priority)', () => {
    const result = transformTask({ taskId: 1 })
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
