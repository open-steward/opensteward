import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawVitallyOrganization,
} from '../../../../../../../src/verticals/crm/adapters/vitally/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawVitallyOrganization> = {}): RawVitallyOrganization {
  return {
    id: 'org_001',
    name: 'Acme Org',
    createdAt: '2026-01-15T09:30:00.000Z',
    updatedAt: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('vitally transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw()).id).toBe('org_001')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Acme Org')
  })

  it('name is empty string when raw.name is null', () => {
    expect(transformPipeline(makeRaw({ name: null })).name).toBe('')
  })

  it('maps createdAt to created_at', () => {
    expect(transformPipeline(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps updatedAt to updated_at', () => {
    expect(transformPipeline(makeRaw()).updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw as metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => PipelineSchema.parse(transformPipeline(makeRaw()))).not.toThrow()
  })

  it('stages is absent (no stages produced for Vitally orgs)', () => {
    // Vitally organizations have no stages — pipeline.stages should be undefined
    expect(transformPipeline(makeRaw()).stages).toBeUndefined()
  })

  it('handles minimal input without throwing', () => {
    const minimal: RawVitallyOrganization = { id: 'org_min' }
    expect(() => PipelineSchema.parse(transformPipeline(minimal))).not.toThrow()
  })
})
