import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawFlowmonoTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/flowmono/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

// NOTE: Flowmono does not expose a live templates endpoint; the transform is a
// stub kept for import-graph integrity. Tests verify the stub behaviour.
describe('flowmono transformTemplate', () => {
  const baseRaw: RawFlowmonoTemplate = {
    id: 'tmpl-abc',
    name: 'NDA Template',
    description: 'Standard NDA',
    createdDate: '2025-01-01T00:00:00.000Z',
    lastModifiedDate: '2025-03-01T00:00:00.000Z',
  }

  it('maps id from raw.id', () => {
    const result = transformTemplate(baseRaw)
    expect(result.id).toBe('tmpl-abc')
  })

  it('maps externalId equal to id', () => {
    const result = transformTemplate(baseRaw)
    expect(result.externalId).toBe('tmpl-abc')
  })

  it('maps name from raw.name', () => {
    const result = transformTemplate(baseRaw)
    expect(result.name).toBe('NDA Template')
  })

  it('maps description', () => {
    const result = transformTemplate(baseRaw)
    expect(result.description).toBe('Standard NDA')
  })

  it('returns empty signerRoles array (stub — no endpoint)', () => {
    const result = transformTemplate(baseRaw)
    expect(result.signerRoles).toEqual([])
  })

  it('returns documentCount of 0 (stub)', () => {
    const result = transformTemplate(baseRaw)
    expect(result.documentCount).toBe(0)
  })

  it('maps createdAt from createdDate', () => {
    const result = transformTemplate(baseRaw)
    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z')
  })

  it('maps updatedAt from lastModifiedDate', () => {
    const result = transformTemplate(baseRaw)
    expect(result.updatedAt).toBe('2025-03-01T00:00:00.000Z')
  })

  it('sets platform to flowmono', () => {
    const result = transformTemplate(baseRaw)
    expect(result.platform).toBe('flowmono')
  })

  it('produces a schema-valid Template', () => {
    const result = transformTemplate(baseRaw)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
