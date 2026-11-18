import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawAnvilCast,
} from '../../../../../../../src/verticals/docsign/adapters/anvil/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('anvil transformTemplate', () => {
  it('maps a full Cast to canonical Template', () => {
    const raw: RawAnvilCast = {
      eid: 'cast-001',
      name: 'nda_template',
      title: 'NDA Template',
      allowedAliasIds: ['signer', 'counter-signer'],
      publishedNumber: 3,
      versionNumber: 7,
      isTemplate: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-15T00:00:00.000Z',
    }

    const result = transformTemplate(raw)

    // id maps from raw.eid
    expect(result.id).toBe('cast-001')
    expect(result.externalId).toBe('cast-001')
    // name prefers raw.title over raw.name
    expect(result.name).toBe('NDA Template')
    // signerRoles from allowedAliasIds
    expect(result.signerRoles).toEqual(['signer', 'counter-signer'])
    // Anvil Cast is always 1 document
    expect(result.documentCount).toBe(1)
    expect(result.platform).toBe('anvil')
    // metadata carries the raw name and version info
    expect(result.metadata.name).toBe('nda_template')
    expect(result.metadata.publishedNumber).toBe('3')
    expect(result.metadata.versionNumber).toBe('7')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to name when title is absent', () => {
    const raw: RawAnvilCast = { eid: 'cast-002', name: 'raw_name_only' }
    const result = transformTemplate(raw)
    expect(result.name).toBe('raw_name_only')
  })

  it('returns empty string name when both title and name absent', () => {
    const result = transformTemplate({ eid: 'cast-003' })
    expect(result.name).toBe('')
    expect(result.documentCount).toBe(1)
    expect(result.signerRoles).toEqual([])
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('filters non-string values from allowedAliasIds', () => {
    const raw: RawAnvilCast = {
      eid: 'cast-004',
      allowedAliasIds: ['valid', 'also-valid'],
    }
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['valid', 'also-valid'])
  })

  it('includes archivedAt in metadata when present', () => {
    const raw: RawAnvilCast = {
      eid: 'cast-005',
      archivedAt: '2026-06-01T00:00:00.000Z',
    }
    const result = transformTemplate(raw)
    expect(result.metadata.archivedAt).toBe('2026-06-01T00:00:00.000Z')
  })
})
