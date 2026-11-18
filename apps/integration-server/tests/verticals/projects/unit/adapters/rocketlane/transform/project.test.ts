import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawRocketlaneProject,
} from '../../../../../../../src/verticals/projects/adapters/rocketlane/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('rocketlane transformProject', () => {
  const raw: RawRocketlaneProject = {
    projectId: 42,
    projectName: 'Acme Onboarding',
    description: 'Onboard Acme Industries onto the platform.',
    status: 'ACTIVE',
    startDate: '2026-01-15T00:00:00Z',
    dueDate: '2026-02-15T00:00:00Z',
    customerId: 99,
    ownerId: 7,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-10T00:00:00Z',
  }

  it('maps projectId to id as string', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('42')
  })

  it('sets externalId equal to id', () => {
    const result = transformProject(raw)
    expect(result.externalId).toBe(result.id)
  })

  it('maps customerId to workspaceId as string', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('99')
  })

  it('workspaceId is empty string when customerId is absent', () => {
    const result = transformProject({ projectId: 1 })
    expect(result.workspaceId).toBe('')
  })

  it('maps projectName to name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Acme Onboarding')
  })

  it('name is empty string when projectName is absent', () => {
    const result = transformProject({ projectId: 1 })
    expect(result.name).toBe('')
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Onboard Acme Industries onto the platform.')
  })

  it('description is undefined when absent', () => {
    const result = transformProject({ projectId: 1 })
    expect(result.description).toBeUndefined()
  })

  it('maps ownerId as string', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('7')
  })

  it('ownerId is undefined when absent', () => {
    const result = transformProject({ projectId: 1 })
    expect(result.ownerId).toBeUndefined()
  })

  it('maps startDate to ISO string', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2026-01-15T00:00:00.000Z')
  })

  it('maps dueDate to endDate as ISO string', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBe('2026-02-15T00:00:00.000Z')
  })

  it('platform is rocketlane', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('rocketlane')
  })

  it('metadata contains raw status string', () => {
    const result = transformProject(raw)
    expect(result.metadata.status).toBe('ACTIVE')
  })

  it('preserves the original raw payload', () => {
    const result = transformProject(raw)
    expect(result.raw).toBe(raw)
  })

  // --- status mapping ---

  it("maps status 'ACTIVE' to 'active'", () => {
    const result = transformProject({ ...raw, status: 'ACTIVE' })
    expect(result.status).toBe('active')
  })

  it("maps unknown/missing status to 'active' (default branch)", () => {
    const result = transformProject({ ...raw, status: 'PLANNING' })
    expect(result.status).toBe('active')
  })

  it("maps status 'ON_HOLD' to 'on_hold'", () => {
    const result = transformProject({ ...raw, status: 'ON_HOLD' })
    expect(result.status).toBe('on_hold')
  })

  it("maps status 'ARCHIVED' to 'archived'", () => {
    const result = transformProject({ ...raw, status: 'ARCHIVED' })
    expect(result.status).toBe('archived')
  })

  it("maps status 'COMPLETED' to 'completed'", () => {
    const result = transformProject({ ...raw, status: 'COMPLETED' })
    expect(result.status).toBe('completed')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  // --- schema parse ---

  it("passes ProjectSchema.parse for 'ACTIVE' status", () => {
    const result = transformProject({ ...raw, status: 'ACTIVE' })
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it("passes ProjectSchema.parse for 'ON_HOLD' status", () => {
    const result = transformProject({ ...raw, status: 'ON_HOLD' })
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it("passes ProjectSchema.parse for 'ARCHIVED' status", () => {
    const result = transformProject({ ...raw, status: 'ARCHIVED' })
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('passes ProjectSchema.parse for a minimal project (id only)', () => {
    const result = transformProject({ projectId: 1 })
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
