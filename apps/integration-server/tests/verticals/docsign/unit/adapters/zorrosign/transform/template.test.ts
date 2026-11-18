import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawZorrosignTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/zorrosign/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('ZorroSign transformTemplate', () => {
  it('maps a fully-populated template to the canonical Template shape', () => {
    const raw: RawZorrosignTemplate = {
      template_id: 'ztmpl_001',
      name: 'Master NDA',
      description: 'Standard non-disclosure agreement',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-06-01T00:00:00.000Z',
      shared: true,
      roles: [{ name: 'Disclosing Party' }, { name: 'Receiving Party' }],
      documents: [{ document_id: 'zdoc_a' }, { document_id: 'zdoc_b' }],
    }
    const result = transformTemplate(raw)

    expect(result.id).toBe('ztmpl_001')
    expect(result.externalId).toBe('ztmpl_001')
    expect(result.name).toBe('Master NDA')
    expect(result.description).toBe('Standard non-disclosure agreement')
    // signerRoles from roles[].name
    expect(result.signerRoles).toEqual(['Disclosing Party', 'Receiving Party'])
    // documentCount from raw.documents.length
    expect(result.documentCount).toBe(2)
    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2025-06-01T00:00:00.000Z')
    expect(result.platform).toBe('zorrosign')
    expect(result.metadata.shared).toBe('true')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to title when name is absent', () => {
    const raw: RawZorrosignTemplate = {
      template_id: 'ztmpl_002',
      title: 'Employment Agreement',
    }
    const result = transformTemplate(raw)

    expect(result.name).toBe('Employment Agreement')
    expect(result.signerRoles).toEqual([])
    expect(result.documentCount).toBe(0)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('collects role names from recipients when roles is absent', () => {
    const raw: RawZorrosignTemplate = {
      template_id: 'ztmpl_003',
      name: 'Sales Contract',
      recipients: [{ role_name: 'Buyer' }, { role: 'Seller' }],
    }
    const result = transformTemplate(raw)

    // role_name preferred over role on recipients
    expect(result.signerRoles).toContain('Buyer')
    expect(result.signerRoles).toContain('Seller')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('uses document_count when documents array is absent', () => {
    const raw: RawZorrosignTemplate = {
      template_id: 'ztmpl_004',
      name: 'NDA',
      document_count: '3',
    }
    const result = transformTemplate(raw)

    expect(result.documentCount).toBe(3)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('outputs empty name when both name and title are absent', () => {
    const raw: RawZorrosignTemplate = { template_id: 'ztmpl_005' }
    const result = transformTemplate(raw)
    expect(result.name).toBe('')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
