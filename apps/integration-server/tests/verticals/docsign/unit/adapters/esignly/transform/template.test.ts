import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawEsignlyTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/esignly/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('esignly transformTemplate', () => {
  it('maps a template with roles array and documents', () => {
    const raw: RawEsignlyTemplate = {
      template_key: 'tmpl-key-001',
      name: 'NDA Template',
      description: 'Standard NDA for new partners',
      roles: [{ role: 'Counterparty', name: 'Counterparty Role' }, { role: 'Witness' }],
      documents: [{}, {}],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
    }
    const result = transformTemplate(raw)

    expect(result.id).toBe('tmpl-key-001')
    expect(result.externalId).toBe('tmpl-key-001')
    expect(result.name).toBe('NDA Template')
    expect(result.description).toBe('Standard NDA for new partners')
    // roles extracted from roles[].role
    expect(result.signerRoles).toEqual(['Counterparty', 'Witness'])
    // documentCount from documents array length
    expect(result.documentCount).toBe(2)
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2026-02-01T00:00:00.000Z')
    expect(result.platform).toBe('esignly')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('prefers signer_roles string array over roles objects', () => {
    const raw: RawEsignlyTemplate = {
      template_key: 'tmpl-002',
      name: 'Employment Contract',
      signer_roles: ['Employee', 'HR Manager'],
      roles: [{ role: 'should-be-ignored' }],
    }
    const result = transformTemplate(raw)

    // signer_roles takes precedence
    expect(result.signerRoles).toEqual(['Employee', 'HR Manager'])
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to template_id when template_key absent', () => {
    const raw: RawEsignlyTemplate = {
      template_id: 'tmpl-fallback-id',
      name: 'Fallback Template',
    }
    const result = transformTemplate(raw)

    expect(result.id).toBe('tmpl-fallback-id')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to title when name absent', () => {
    const raw: RawEsignlyTemplate = {
      template_key: 'tmpl-003',
      title: 'Title Only Template',
    }
    const result = transformTemplate(raw)

    expect(result.name).toBe('Title Only Template')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('uses document_count as numeric fallback when documents array absent', () => {
    const raw: RawEsignlyTemplate = {
      template_key: 'tmpl-004',
      name: 'Count Fallback',
      document_count: '3',
    }
    const result = transformTemplate(raw)

    expect(result.documentCount).toBe(3)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('subject is stored in metadata not on the canonical field', () => {
    const raw: RawEsignlyTemplate = {
      template_key: 'tmpl-005',
      name: 'Subject Test',
      subject: 'Please sign this template',
    }
    const result = transformTemplate(raw)

    expect(result.metadata['subject']).toBe('Please sign this template')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
