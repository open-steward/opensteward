import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawActasignTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/actasign/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('actasign transformTemplate', () => {
  it('maps a full raw template to canonical Template', () => {
    const raw: RawActasignTemplate = {
      id: 'tmpl-001',
      name: 'NDA Template',
      description: 'Standard NDA for vendors',
      signature_level: 'SES',
      signatory_roles: [
        { name: 'Counterparty', order: 0 },
        { name: 'Company Rep', order: 1 },
      ],
      document_count: 2,
      documents: [{ id: 'doc-a' }, { id: 'doc-b' }],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-15T00:00:00.000Z',
    }

    const result = transformTemplate(raw)

    // id maps from raw.id
    expect(result.id).toBe('tmpl-001')
    expect(result.externalId).toBe('tmpl-001')
    expect(result.name).toBe('NDA Template')
    expect(result.description).toBe('Standard NDA for vendors')
    // signerRoles extracts name from signatory_roles
    expect(result.signerRoles).toEqual(['Counterparty', 'Company Rep'])
    // documentCount prefers raw.document_count
    expect(result.documentCount).toBe(2)
    expect(result.platform).toBe('actasign')
    expect(result.metadata.signatureLevel).toBe('SES')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('derives documentCount from documents array when document_count absent', () => {
    const raw: RawActasignTemplate = {
      id: 'tmpl-002',
      documents: [{ id: 'doc-1' }, { id: 'doc-2' }, { id: 'doc-3' }],
    }
    const result = transformTemplate(raw)
    expect(result.documentCount).toBe(3)
    expect(result.name).toBe('')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('filters out signatory_roles entries with no name', () => {
    const raw: RawActasignTemplate = {
      id: 'tmpl-003',
      signatory_roles: [
        { name: 'Signer A', order: 0 },
        { order: 1 }, // no name
        { name: 'Signer B', order: 2 },
      ],
    }
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['Signer A', 'Signer B'])
  })

  it('handles empty template gracefully', () => {
    const result = transformTemplate({ id: 'tmpl-min' })
    expect(result.id).toBe('tmpl-min')
    expect(result.signerRoles).toEqual([])
    expect(result.documentCount).toBe(0)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
