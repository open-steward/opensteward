import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawDochubTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/dochub/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('dochub transformTemplate', () => {
  it('maps a template with recipient_roles', () => {
    const raw: RawDochubTemplate = {
      id: 'tpl-1',
      name: 'NDA Template',
      description: 'Standard NDA for new partners',
      recipient_roles: [
        { name: 'Counterparty', role: 'signer' },
        { name: 'Witness', role: 'witness' },
      ],
      documents: [{ id: 'doc-a' }, { id: 'doc-b' }],
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-06-01T00:00:00.000Z',
      shared: true,
    }
    const result = transformTemplate(raw)

    expect(result.id).toBe('tpl-1')
    expect(result.externalId).toBe('tpl-1')
    expect(result.name).toBe('NDA Template')
    expect(result.description).toBe('Standard NDA for new partners')
    // recipient_roles preferred; names extracted
    expect(result.signerRoles).toEqual(['Counterparty', 'Witness'])
    // documentCount from documents array length
    expect(result.documentCount).toBe(2)
    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2025-06-01T00:00:00.000Z')
    expect(result.platform).toBe('dochub')
    expect(result.metadata.shared).toBe('true')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to roles array when recipient_roles absent', () => {
    const raw: RawDochubTemplate = {
      id: 'tpl-2',
      title: 'Service Agreement',
      roles: [{ name: 'Client' }, { name: 'Provider' }],
    }
    const result = transformTemplate(raw)

    // title used when name absent
    expect(result.name).toBe('Service Agreement')
    // falls back to roles
    expect(result.signerRoles).toEqual(['Client', 'Provider'])
    expect(result.documentCount).toBe(0)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('uses document_count when documents array absent', () => {
    const raw: RawDochubTemplate = {
      id: 'tpl-3',
      name: 'Minimal Template',
      document_count: '3',
    }
    const result = transformTemplate(raw)

    expect(result.documentCount).toBe(3)
    expect(result.signerRoles).toEqual([])
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('prefers recipient_role name over role field', () => {
    const raw: RawDochubTemplate = {
      id: 'tpl-4',
      name: 'Multi-role',
      recipient_roles: [{ name: 'Buyer' }, { role: 'cc' }],
    }
    const result = transformTemplate(raw)

    // first entry has name "Buyer"; second entry falls back to role "cc"
    expect(result.signerRoles).toEqual(['Buyer', 'cc'])
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
