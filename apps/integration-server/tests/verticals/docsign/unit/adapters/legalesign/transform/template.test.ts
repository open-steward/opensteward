import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawLegalesignTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/legalesign/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('legalesign transformTemplate', () => {
  const raw: RawLegalesignTemplate = {
    uuid: 'tmpl-uuid-1',
    title: 'NDA Template',
    created: '2025-01-10T08:00:00.000Z',
    modified: '2025-02-15T10:00:00.000Z',
    user: '/api/v1/user/usr-01/',
    group: '/api/v1/group/grp-01/',
    signer_count: 2,
    page_count: 3,
    valid: true,
    parties: '["Disclosing Party","Receiving Party"]',
  }

  it('maps uuid to id and externalId', () => {
    const result = transformTemplate(raw)
    expect(result.id).toBe('tmpl-uuid-1')
    expect(result.externalId).toBe('tmpl-uuid-1')
  })

  it('maps title to name', () => {
    const result = transformTemplate(raw)
    expect(result.name).toBe('NDA Template')
  })

  it('parses parties JSON string into signerRoles array', () => {
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['Disclosing Party', 'Receiving Party'])
  })

  it('sets documentCount to 1 (single composed PDF)', () => {
    const result = transformTemplate(raw)
    expect(result.documentCount).toBe(1)
  })

  it('maps createdAt from created field', () => {
    const result = transformTemplate(raw)
    expect(result.createdAt).toBe('2025-01-10T08:00:00.000Z')
  })

  it('maps updatedAt from modified field', () => {
    const result = transformTemplate(raw)
    expect(result.updatedAt).toBe('2025-02-15T10:00:00.000Z')
  })

  it('sets platform to legalesign', () => {
    const result = transformTemplate(raw)
    expect(result.platform).toBe('legalesign')
  })

  it('returns empty signerRoles when parties is absent', () => {
    const { parties: _, ...rest } = raw
    const result = transformTemplate(rest as RawLegalesignTemplate)
    expect(result.signerRoles).toEqual([])
  })

  it('returns empty signerRoles when parties is invalid JSON', () => {
    const result = transformTemplate({ ...raw, parties: 'not-json' })
    expect(result.signerRoles).toEqual([])
  })

  it('falls back to signee_count for signerCount metadata when signer_count absent', () => {
    const { signer_count: _, ...rest } = raw
    const result = transformTemplate({ ...rest, signee_count: 3 })
    // signerCount in metadata via strMap
    expect(result.metadata.signerCount).toBe('3')
  })

  it('passes TemplateSchema validation', () => {
    const result = transformTemplate(raw)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
