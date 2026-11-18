import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawIcertisTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/icertis/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

const base: RawIcertisTemplate = {
  ICMId: 'tmpl-001',
  Name: 'NDA Template',
  DisplayName: 'Non-Disclosure Agreement',
  Description: 'Standard NDA',
  ContractType: 'NDA',
  SignatoryRoles: ['Counterparty', 'Witness'],
  AssociatedDocumentCount: 2,
  CreatedOn: '2025-01-01T00:00:00.000Z',
  ModifiedOn: '2025-06-01T00:00:00.000Z',
}

describe('icertis transformTemplate', () => {
  it('maps id and externalId from ICMId', () => {
    const result = transformTemplate(base)
    expect(result.id).toBe('tmpl-001')
    expect(result.externalId).toBe('tmpl-001')
  })

  it('maps name from Name field', () => {
    const result = transformTemplate(base)
    expect(result.name).toBe('NDA Template')
  })

  it('falls back to DisplayName when Name is missing', () => {
    const { Name, ...noName } = base
    const result = transformTemplate(noName as RawIcertisTemplate)
    expect(result.name).toBe('Non-Disclosure Agreement')
  })

  it('maps description', () => {
    const result = transformTemplate(base)
    expect(result.description).toBe('Standard NDA')
  })

  it('maps signerRoles from SignatoryRoles', () => {
    const result = transformTemplate(base)
    expect(result.signerRoles).toEqual(['Counterparty', 'Witness'])
  })

  it('falls back to Roles when SignatoryRoles is absent', () => {
    const result = transformTemplate({
      ...base,
      SignatoryRoles: undefined,
      Roles: ['Buyer', 'Seller'],
    })
    expect(result.signerRoles).toEqual(['Buyer', 'Seller'])
  })

  it('maps documentCount from AssociatedDocumentCount', () => {
    const result = transformTemplate(base)
    expect(result.documentCount).toBe(2)
  })

  it('defaults documentCount to 1 when both count fields absent', () => {
    const result = transformTemplate({ ICMId: 'tmpl-min' })
    expect(result.documentCount).toBe(1)
  })

  it('maps createdAt and updatedAt to ISO strings', () => {
    const result = transformTemplate(base)
    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2025-06-01T00:00:00.000Z')
  })

  it('sets platform to icertis', () => {
    const result = transformTemplate(base)
    expect(result.platform).toBe('icertis')
  })

  it('stores contractType in metadata', () => {
    const result = transformTemplate(base)
    expect(result.metadata['contractType']).toBe('NDA')
  })

  it('passes TemplateSchema validation', () => {
    const result = transformTemplate(base)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('handles minimal input (only ICMId)', () => {
    const result = transformTemplate({ ICMId: 'tmpl-bare' })
    expect(result.id).toBe('tmpl-bare')
    expect(result.signerRoles).toEqual([])
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
