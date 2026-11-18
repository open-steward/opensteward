import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawProofTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/proof/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('proof transformTemplate', () => {
  const raw: RawProofTemplate = {
    id: 'tmpl_001',
    name: 'Mortgage Closing Template',
    permalink: 'mortgage-closing-template',
    created_at: '2026-01-05T09:00:00.000Z',
    updated_at: '2026-01-10T10:00:00.000Z',
  }

  it('maps id and externalId from template id', () => {
    const result = transformTemplate(raw)
    expect(result.id).toBe('tmpl_001')
    expect(result.externalId).toBe('tmpl_001')
  })

  it('falls back to permalink for id when id is absent', () => {
    const result = transformTemplate({ ...raw, id: undefined })
    expect(result.id).toBe('mortgage-closing-template')
    expect(result.externalId).toBe('mortgage-closing-template')
  })

  it('maps name from name field', () => {
    const result = transformTemplate(raw)
    expect(result.name).toBe('Mortgage Closing Template')
  })

  it('sets signerRoles to empty array', () => {
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual([])
  })

  it('sets documentCount to 0', () => {
    const result = transformTemplate(raw)
    expect(result.documentCount).toBe(0)
  })

  it('maps createdAt from created_at', () => {
    const result = transformTemplate(raw)
    expect(result.createdAt).toBe('2026-01-05T09:00:00.000Z')
  })

  it('maps updatedAt from updated_at', () => {
    const result = transformTemplate(raw)
    expect(result.updatedAt).toBe('2026-01-10T10:00:00.000Z')
  })

  it('sets platform to proof', () => {
    const result = transformTemplate(raw)
    expect(result.platform).toBe('proof')
  })

  it('includes permalink in metadata', () => {
    const result = transformTemplate(raw)
    expect(result.metadata.permalink).toBe('mortgage-closing-template')
  })

  it('passes TemplateSchema.parse without throwing', () => {
    const result = transformTemplate(raw)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
