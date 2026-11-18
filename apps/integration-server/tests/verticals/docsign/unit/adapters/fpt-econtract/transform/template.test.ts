import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawFptEcontractTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/fpt-econtract/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('fpt-econtract transformTemplate', () => {
  const baseRaw: RawFptEcontractTemplate = {
    id: 'tmpl-1',
    code: 'T001',
    name: 'Service Contract',
    description: 'Standard service contract template',
    status: 'active',
    roles: [
      { name: 'Vendor', roleName: 'Vendor' },
      { name: 'Customer', roleName: 'Customer' },
    ],
    documents: [{ id: 'doc-a' }, { id: 'doc-b' }],
    createdAt: '2025-01-10T00:00:00.000Z',
    updatedAt: '2025-02-15T00:00:00.000Z',
  }

  it('maps id from raw.id', () => {
    const result = transformTemplate(baseRaw)
    expect(result.id).toBe('tmpl-1')
    expect(result.externalId).toBe('tmpl-1')
  })

  it('maps name from raw.name', () => {
    const result = transformTemplate(baseRaw)
    expect(result.name).toBe('Service Contract')
  })

  it('maps description', () => {
    const result = transformTemplate(baseRaw)
    expect(result.description).toBe('Standard service contract template')
  })

  it('extracts signerRoles from roles[].roleName', () => {
    const result = transformTemplate(baseRaw)
    expect(result.signerRoles).toEqual(['Vendor', 'Customer'])
  })

  it('falls back to string entries in roles array', () => {
    const result = transformTemplate({ ...baseRaw, roles: ['SignerA', 'SignerB'] })
    expect(result.signerRoles).toEqual(['SignerA', 'SignerB'])
  })

  it('extracts documentCount from documents array length', () => {
    const result = transformTemplate(baseRaw)
    expect(result.documentCount).toBe(2)
  })

  it('falls back documentCount to raw.documentCount when documents absent', () => {
    const result = transformTemplate({
      ...baseRaw,
      documents: undefined,
      documentCount: 5,
    })
    expect(result.documentCount).toBe(5)
  })

  it('maps createdAt', () => {
    const result = transformTemplate(baseRaw)
    expect(result.createdAt).toBe('2025-01-10T00:00:00.000Z')
  })

  it('maps updatedAt', () => {
    const result = transformTemplate(baseRaw)
    expect(result.updatedAt).toBe('2025-02-15T00:00:00.000Z')
  })

  it('sets platform to fpt-econtract', () => {
    const result = transformTemplate(baseRaw)
    expect(result.platform).toBe('fpt-econtract')
  })

  it('produces a schema-valid Template', () => {
    const result = transformTemplate(baseRaw)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
