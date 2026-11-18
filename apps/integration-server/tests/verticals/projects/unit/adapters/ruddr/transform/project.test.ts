import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawRuddrProject,
} from '../../../../../../../src/verticals/projects/adapters/ruddr/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('ruddr transformProject', () => {
  const baseRaw: RawRuddrProject = {
    id: 'proj-1',
    name: 'Acme Onboarding',
    statusId: 'in_progress',
    recordStatusId: 'active',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformProject(baseRaw)
    expect(result.id).toBe('proj-1')
    expect(result.externalId).toBe('proj-1')
  })

  it('maps name from raw.name', () => {
    const result = transformProject(baseRaw)
    expect(result.name).toBe('Acme Onboarding')
  })

  it('workspaceId is empty string (Ruddr does not embed workspace in project)', () => {
    const result = transformProject(baseRaw)
    expect(result.workspaceId).toBe('')
  })

  it('platform is ruddr', () => {
    const result = transformProject(baseRaw)
    expect(result.platform).toBe('ruddr')
  })

  it('maps ownerId from salesRepresentative.id', () => {
    const raw: RawRuddrProject = {
      ...baseRaw,
      salesRepresentative: { id: 'user-42', name: 'Jane Doe' },
    }
    const result = transformProject(raw)
    expect(result.ownerId).toBe('user-42')
  })

  it('ownerId is undefined when salesRepresentative is absent', () => {
    const result = transformProject(baseRaw)
    expect(result.ownerId).toBeUndefined()
  })

  it('ownerId is undefined when salesRepresentative is null', () => {
    const raw: RawRuddrProject = { ...baseRaw, salesRepresentative: null }
    const result = transformProject(raw)
    expect(result.ownerId).toBeUndefined()
  })

  // --- Status mapping ---

  it('recordStatusId="archived" maps to "archived" (takes priority over statusId)', () => {
    const raw: RawRuddrProject = {
      ...baseRaw,
      recordStatusId: 'archived',
      statusId: 'in_progress',
    }
    const result = transformProject(raw)
    expect(result.status).toBe('archived')
  })

  it('statusId="in_progress" maps to "active"', () => {
    const raw: RawRuddrProject = { ...baseRaw, statusId: 'in_progress', recordStatusId: 'active' }
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('statusId="not_started" maps to "unknown"', () => {
    const raw: RawRuddrProject = { ...baseRaw, statusId: 'not_started', recordStatusId: 'active' }
    const result = transformProject(raw)
    expect(result.status).toBe('unknown')
  })

  it('statusId="tentative" maps to "unknown"', () => {
    const raw: RawRuddrProject = { ...baseRaw, statusId: 'tentative', recordStatusId: 'active' }
    const result = transformProject(raw)
    expect(result.status).toBe('unknown')
  })

  it('statusId="paused" maps to "on_hold"', () => {
    const raw: RawRuddrProject = { ...baseRaw, statusId: 'paused', recordStatusId: 'active' }
    const result = transformProject(raw)
    expect(result.status).toBe('on_hold')
  })

  it('statusId="completed" maps to "completed"', () => {
    const raw: RawRuddrProject = { ...baseRaw, statusId: 'completed', recordStatusId: 'active' }
    const result = transformProject(raw)
    expect(result.status).toBe('completed')
  })

  it('statusId="cancelled" maps to "unknown"', () => {
    const raw: RawRuddrProject = { ...baseRaw, statusId: 'cancelled', recordStatusId: 'active' }
    const result = transformProject(raw)
    expect(result.status).toBe('unknown')
  })

  it('unknown statusId maps to "unknown"', () => {
    const raw: RawRuddrProject = { ...baseRaw, statusId: 'whatever', recordStatusId: 'active' }
    const result = transformProject(raw)
    expect(result.status).toBe('unknown')
  })

  // --- Date fields ---

  it('endDate prefers raw.end over raw.completedOn', () => {
    const raw: RawRuddrProject = {
      ...baseRaw,
      end: '2026-03-01T00:00:00Z',
      completedOn: '2026-01-15T00:00:00Z',
    }
    const result = transformProject(raw)
    expect(result.endDate).toBe(new Date('2026-03-01T00:00:00Z').toISOString())
  })

  it('endDate falls back to raw.completedOn when raw.end is absent', () => {
    const raw: RawRuddrProject = {
      ...baseRaw,
      end: null,
      completedOn: '2026-01-15T00:00:00Z',
    }
    const result = transformProject(raw)
    expect(result.endDate).toBe(new Date('2026-01-15T00:00:00Z').toISOString())
  })

  it('endDate is undefined when both raw.end and raw.completedOn are absent', () => {
    const result = transformProject(baseRaw)
    expect(result.endDate).toBeUndefined()
  })

  it('startDate is mapped from raw.start', () => {
    const raw: RawRuddrProject = { ...baseRaw, start: '2026-01-01T00:00:00Z' }
    const result = transformProject(raw)
    expect(result.startDate).toBe(new Date('2026-01-01T00:00:00Z').toISOString())
  })

  it('createdAt is mapped from raw.createdAt', () => {
    const raw: RawRuddrProject = { ...baseRaw, createdAt: '2025-12-01T10:00:00Z' }
    const result = transformProject(raw)
    expect(result.createdAt).toBe(new Date('2025-12-01T10:00:00Z').toISOString())
  })

  it('updatedAt is always undefined (Ruddr does not expose it)', () => {
    const result = transformProject(baseRaw)
    expect(result.updatedAt).toBeUndefined()
  })

  it('description is mapped from raw.notes', () => {
    const raw: RawRuddrProject = { ...baseRaw, notes: 'Some description text' }
    const result = transformProject(raw)
    expect(result.description).toBe('Some description text')
  })

  it('description is undefined when notes is null', () => {
    const raw: RawRuddrProject = { ...baseRaw, notes: null }
    const result = transformProject(raw)
    expect(result.description).toBeUndefined()
  })

  // --- Metadata ---

  it('metadata includes key, code, poNumber from raw fields', () => {
    const raw: RawRuddrProject = {
      ...baseRaw,
      key: 'ACME',
      code: 'PRJ-001',
      poNumber: 'PO-12345',
    }
    const result = transformProject(raw)
    expect(result.metadata.key).toBe('ACME')
    expect(result.metadata.code).toBe('PRJ-001')
    expect(result.metadata.poNumber).toBe('PO-12345')
  })

  it('metadata includes billingTypeId and isBillable as string', () => {
    const raw: RawRuddrProject = {
      ...baseRaw,
      billingTypeId: 'time_and_materials',
      isBillable: true,
    }
    const result = transformProject(raw)
    expect(result.metadata.billingTypeId).toBe('time_and_materials')
    expect(result.metadata.isBillable).toBe('true')
  })

  it('metadata includes clientId and clientName', () => {
    const raw: RawRuddrProject = {
      ...baseRaw,
      client: { id: 'client-7', name: 'Acme Corp' },
    }
    const result = transformProject(raw)
    expect(result.metadata.clientId).toBe('client-7')
    expect(result.metadata.clientName).toBe('Acme Corp')
  })

  it('metadata includes recordStatusId', () => {
    const raw: RawRuddrProject = { ...baseRaw, recordStatusId: 'active' }
    const result = transformProject(raw)
    expect(result.metadata.recordStatusId).toBe('active')
  })

  it('metadata omits null / undefined values', () => {
    const result = transformProject(baseRaw)
    expect(Object.keys(result.metadata)).not.toContain('clientId')
    expect(Object.keys(result.metadata)).not.toContain('poNumber')
  })

  // --- Schema validation ---

  it('passes ProjectSchema.parse with full fixture', () => {
    const raw: RawRuddrProject = {
      id: 'proj-99',
      name: 'Full Fixture Project',
      statusId: 'in_progress',
      recordStatusId: 'active',
      key: 'FULL',
      code: 'PRJ-099',
      start: '2026-01-01T00:00:00Z',
      end: '2026-06-30T00:00:00Z',
      createdAt: '2025-11-01T08:00:00Z',
      isBillable: true,
      currency: 'USD',
      client: { id: 'c-1', name: 'BigCo' },
      salesRepresentative: { id: 'usr-5', name: 'Rep Name' },
    }
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('passes ProjectSchema.parse with minimal fixture', () => {
    const result = transformProject({ id: 'proj-min' })
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
