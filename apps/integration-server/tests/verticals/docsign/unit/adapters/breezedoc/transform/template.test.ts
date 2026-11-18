import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawBreezedocTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/breezedoc/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('breezedoc transformTemplate', () => {
  it('maps a template document to canonical Template', () => {
    const raw: RawBreezedocTemplate = {
      id: 301,
      title: 'Standard NDA',
      slug: 'standard-nda',
      is_template: true,
      created_at: '2026-01-05T08:00:00.000Z',
      updated_at: '2026-02-10T12:00:00.000Z',
      document_files: [{ id: 601 }, { id: 602 }],
      recipients: [
        { id: 1, name: 'Party A' },
        { id: 2, name: 'Party B' },
      ],
    }

    const result = transformTemplate(raw)

    expect(result.id).toBe('301')
    expect(result.externalId).toBe('301')
    expect(result.name).toBe('Standard NDA')
    // recipient names become signerRoles
    expect(result.signerRoles).toEqual(['Party A', 'Party B'])
    expect(result.documentCount).toBe(2)
    expect(result.createdAt).toBe('2026-01-05T08:00:00.000Z')
    expect(result.updatedAt).toBe('2026-02-10T12:00:00.000Z')
    expect(result.platform).toBe('breezedoc')
    expect(result.metadata.slug).toBe('standard-nda')
    expect(result.metadata.isTemplate).toBe('true')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('maps a template with no recipients to empty signerRoles', () => {
    const raw: RawBreezedocTemplate = {
      id: 302,
      title: 'Empty Template',
      is_template: true,
    }

    const result = transformTemplate(raw)

    expect(result.name).toBe('Empty Template')
    expect(result.signerRoles).toEqual([])
    expect(result.documentCount).toBe(0)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('filters out recipients with undefined or empty name from signerRoles', () => {
    const raw: RawBreezedocTemplate = {
      id: 303,
      title: 'Partial Recipients',
      is_template: true,
      recipients: [
        { id: 1, name: 'Signer One' },
        { id: 2, name: undefined },
        { id: 3, name: 'Signer Three' },
      ],
    }

    const result = transformTemplate(raw)

    expect(result.signerRoles).toEqual(['Signer One', 'Signer Three'])
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('produces empty name string when title is absent', () => {
    const raw: RawBreezedocTemplate = {
      id: 304,
      is_template: true,
    }

    const result = transformTemplate(raw)
    expect(result.name).toBe('')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('handles string id', () => {
    const raw: RawBreezedocTemplate = {
      id: 'tmpl-abc',
      title: 'String ID Template',
      is_template: true,
      document_files: [{ id: 701 }],
    }

    const result = transformTemplate(raw)

    expect(result.id).toBe('tmpl-abc')
    expect(result.externalId).toBe('tmpl-abc')
    expect(result.documentCount).toBe(1)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
