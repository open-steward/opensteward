import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawDocusealTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/docuseal/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('docuseal transformTemplate', () => {
  it('maps a full template with submitters and documents', () => {
    const raw: RawDocusealTemplate = {
      id: 9,
      slug: 'nda-template-abc',
      name: 'NDA Template',
      source: 'native',
      external_id: 'ext-9',
      folder_id: 3,
      folder_name: 'Legal',
      shared_link: false,
      author_id: 1,
      author: { id: 1, first_name: 'Alice', last_name: 'Admin', email: 'alice@example.com' },
      submitters: [
        { name: 'Counterparty', uuid: 'uuid-cp' },
        { name: 'Internal Approver', uuid: 'uuid-ia' },
      ],
      documents: [{ id: 100, uuid: 'doc-uuid-1', filename: 'nda.pdf' }],
      fields: [
        { uuid: 'f1', name: 'Signature', type: 'signature' },
        { uuid: 'f2', name: 'Date', type: 'date' },
      ],
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-06-01T00:00:00.000Z',
      archived_at: null,
    }
    const result = transformTemplate(raw)

    expect(result.id).toBe('9')
    expect(result.externalId).toBe('9')
    expect(result.name).toBe('NDA Template')
    expect(result.signerRoles).toEqual(['Counterparty', 'Internal Approver'])
    // documentCount from documents array
    expect(result.documentCount).toBe(1)
    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2025-06-01T00:00:00.000Z')
    expect(result.platform).toBe('docuseal')
    expect(result.metadata.slug).toBe('nda-template-abc')
    expect(result.metadata.source).toBe('native')
    expect(result.metadata.externalId).toBe('ext-9')
    expect(result.metadata.folderName).toBe('Legal')
    expect(result.metadata.fieldCount).toBe('2')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to schema array length for documentCount when documents absent', () => {
    const raw: RawDocusealTemplate = {
      id: 10,
      name: 'Invoice Template',
      schema: [
        { attachment_uuid: 'att-1', name: 'Invoice' },
        { attachment_uuid: 'att-2', name: 'Annex' },
      ],
      submitters: [{ name: 'Buyer' }],
    }
    const result = transformTemplate(raw)

    expect(result.documentCount).toBe(2)
    expect(result.signerRoles).toEqual(['Buyer'])
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('returns documentCount=0 when neither documents nor schema present', () => {
    const raw: RawDocusealTemplate = {
      id: 11,
      name: 'Empty Template',
    }
    const result = transformTemplate(raw)

    expect(result.documentCount).toBe(0)
    expect(result.signerRoles).toEqual([])
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('excludes submitters with no name from signerRoles', () => {
    const raw: RawDocusealTemplate = {
      id: 12,
      name: 'Partial Template',
      submitters: [
        { name: 'Client' },
        { uuid: 'uuid-noname' }, // no name
        { name: '' }, // empty string
      ],
    }
    const result = transformTemplate(raw)

    // Only "Client" passes the filter (non-empty string name)
    expect(result.signerRoles).toEqual(['Client'])
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('includes archivedAt in metadata when present', () => {
    const raw: RawDocusealTemplate = {
      id: 13,
      name: 'Archived Template',
      archived_at: '2025-09-01T00:00:00.000Z',
    }
    const result = transformTemplate(raw)

    expect(result.metadata.archivedAt).toBe('2025-09-01T00:00:00.000Z')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
