import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawBlueinkTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/blueink/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('blueink transformTemplate', () => {
  const raw: RawBlueinkTemplate = {
    id: 'tmpl_abc123',
    name: 'Master Services Agreement',
    description: 'Standard MSA for enterprise customers',
    created: '2024-01-15T10:00:00.000Z',
    modified: '2024-02-01T12:00:00.000Z',
    roles: [
      { role: 'Customer', name: 'Customer Role' },
      { role: 'Vendor', name: 'Vendor Role' },
    ],
    documents: [{ key: 'doc_1' }, { key: 'doc_2' }],
    is_test: false,
  }

  it('maps id and externalId from template id', () => {
    const result = transformTemplate(raw)
    expect(result.id).toBe('tmpl_abc123')
    expect(result.externalId).toBe('tmpl_abc123')
  })

  it('maps name', () => {
    const result = transformTemplate(raw)
    expect(result.name).toBe('Master Services Agreement')
  })

  it('maps description', () => {
    const result = transformTemplate(raw)
    expect(result.description).toBe('Standard MSA for enterprise customers')
  })

  it('maps signerRoles from role objects using role field', () => {
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['Customer', 'Vendor'])
  })

  it('maps signerRoles from string array entries', () => {
    const result = transformTemplate({ ...raw, roles: ['Signer', 'Witness'] })
    expect(result.signerRoles).toEqual(['Signer', 'Witness'])
  })

  it('maps documentCount from documents array length', () => {
    const result = transformTemplate(raw)
    expect(result.documentCount).toBe(2)
  })

  it('falls back to num_documents when documents is not an array', () => {
    const result = transformTemplate({ ...raw, documents: undefined, num_documents: 5 })
    expect(result.documentCount).toBe(5)
  })

  it('maps createdAt from created field', () => {
    const result = transformTemplate(raw)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('maps updatedAt from modified field', () => {
    const result = transformTemplate(raw)
    expect(result.updatedAt).toBe('2024-02-01T12:00:00.000Z')
  })

  it('sets platform to blueink', () => {
    const result = transformTemplate(raw)
    expect(result.platform).toBe('blueink')
  })

  it('includes isTest in metadata', () => {
    const result = transformTemplate({ ...raw, is_test: true })
    expect(result.metadata.isTest).toBe('true')
  })

  it('omits description when not provided', () => {
    const result = transformTemplate({ ...raw, description: undefined })
    expect(result.description).toBeUndefined()
  })

  it('passes TemplateSchema.parse without throwing', () => {
    const result = transformTemplate(raw)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
