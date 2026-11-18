import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawSignorityDocument,
} from '../../../../../../../src/verticals/docsign/adapters/signority/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

const rawTemplate: RawSignorityDocument = {
  id: 77,
  GUID: 'tmpl-guid-77',
  title: 'MSA Template',
  documentType: 7, // REGULAR_TEMPLATE
  createdTime: 1705312800000,
  lastModifiedTime: 1708000000000,
  invitations: [
    { id: 1, recipientName: 'Buyer', actionType: 15 },
    { id: 2, recipientName: 'Seller', actionType: 15 },
  ],
  files: [{ id: 'file-a' }, { id: 'file-b' }],
}

describe('signority transformTemplate', () => {
  it('maps id from raw.id as string', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.id).toBe('77')
    expect(result.externalId).toBe('77')
  })

  it('maps title to name', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.name).toBe('MSA Template')
  })

  it('extracts signerRoles from invitation recipientNames', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.signerRoles).toEqual(['Buyer', 'Seller'])
  })

  it('maps files.length to documentCount', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.documentCount).toBe(2)
  })

  it('returns documentCount 0 when files absent', () => {
    const result = transformTemplate({ ...rawTemplate, files: undefined })
    expect(result.documentCount).toBe(0)
  })

  it('maps createdTime epoch millis to createdAt ISO', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.createdAt).toBe(new Date(1705312800000).toISOString())
  })

  it('maps lastModifiedTime to updatedAt', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.updatedAt).toBe(new Date(1708000000000).toISOString())
  })

  it('sets platform to signority', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.platform).toBe('signority')
  })

  it('puts GUID and documentType into metadata', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.metadata.GUID).toBe('tmpl-guid-77')
    expect(result.metadata.documentType).toBe('7')
  })

  it('passes TemplateSchema.parse without throwing', () => {
    const result = transformTemplate(rawTemplate)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('returns empty signerRoles when invitations absent', () => {
    const result = transformTemplate({ ...rawTemplate, invitations: [] })
    expect(result.signerRoles).toEqual([])
  })
})
