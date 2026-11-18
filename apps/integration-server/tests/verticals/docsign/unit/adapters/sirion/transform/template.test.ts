import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawSirionTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/sirion/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

const rawTemplate: RawSirionTemplate = {
  contractTemplateId: 'tmpl-sirion-001',
  name: 'MSA Template',
  description: 'Standard MSA for new customers',
  signatoryRoles: ['Buyer', 'Seller'],
  documentCount: 2,
  createdOn: '2024-01-10T08:00:00.000Z',
  lastModifiedOn: '2024-01-20T09:00:00.000Z',
}

describe('sirion transformTemplate', () => {
  it('uses contractTemplateId as id', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.id).toBe('tmpl-sirion-001')
    expect(result.externalId).toBe('tmpl-sirion-001')
  })

  it('falls back to templateId when contractTemplateId absent', () => {
    const result = transformTemplate({
      ...rawTemplate,
      contractTemplateId: undefined,
      templateId: 'tmpl-sirion-002',
    })
    expect(result.id).toBe('tmpl-sirion-002')
  })

  it('falls back to id field when both contractTemplateId and templateId absent', () => {
    const result = transformTemplate({
      ...rawTemplate,
      contractTemplateId: undefined,
      templateId: undefined,
      id: 'raw-id-003',
    })
    expect(result.id).toBe('raw-id-003')
  })

  it('maps name', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.name).toBe('MSA Template')
  })

  it('falls back to title when name absent', () => {
    const result = transformTemplate({ ...rawTemplate, name: undefined, title: 'NDA Template' })
    expect(result.name).toBe('NDA Template')
  })

  it('maps description', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.description).toBe('Standard MSA for new customers')
  })

  it('maps signatoryRoles to signerRoles', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.signerRoles).toEqual(['Buyer', 'Seller'])
  })

  it('maps roles array of objects when signatoryRoles absent', () => {
    const result = transformTemplate({
      ...rawTemplate,
      signatoryRoles: undefined,
      roles: [{ name: 'Approver' }, { name: 'Witness' }],
    })
    expect(result.signerRoles).toEqual(['Approver', 'Witness'])
  })

  it('maps roles array of strings when signatoryRoles absent', () => {
    const result = transformTemplate({
      ...rawTemplate,
      signatoryRoles: undefined,
      roles: ['Signer', 'CC'],
    })
    expect(result.signerRoles).toEqual(['Signer', 'CC'])
  })

  it('returns empty signerRoles when neither signatoryRoles nor roles present', () => {
    const result = transformTemplate({
      ...rawTemplate,
      signatoryRoles: undefined,
      roles: undefined,
    })
    expect(result.signerRoles).toEqual([])
  })

  it('maps documentCount', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.documentCount).toBe(2)
  })

  it('defaults documentCount to 1 when absent', () => {
    const result = transformTemplate({ ...rawTemplate, documentCount: undefined })
    expect(result.documentCount).toBe(1)
  })

  it('maps createdOn to createdAt', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.createdAt).toBe('2024-01-10T08:00:00.000Z')
  })

  it('maps lastModifiedOn to updatedAt', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.updatedAt).toBe('2024-01-20T09:00:00.000Z')
  })

  it('sets platform to sirion', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.platform).toBe('sirion')
  })

  it('passes TemplateSchema.parse without throwing', () => {
    const result = transformTemplate(rawTemplate)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
