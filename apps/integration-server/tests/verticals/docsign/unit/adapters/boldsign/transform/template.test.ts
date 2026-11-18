import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawBoldsignTemplate,
  type RawBoldsignTemplateRole,
} from '../../../../../../../src/verticals/docsign/adapters/boldsign/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

const CREATED_EPOCH = 1705312800 // 2024-01-15T10:00:00.000Z
const MODIFIED_EPOCH = 1708000000 // 2024-02-15T12:26:40.000Z

const roles: RawBoldsignTemplateRole[] = [
  {
    roleName: 'Signer',
    defaultSignerName: 'John Doe',
    defaultSignerEmail: 'john@example.com',
    signerOrder: 1,
    signerType: 'Signer',
  },
  {
    roleName: 'Approver',
    defaultSignerName: 'Jane Smith',
    defaultSignerEmail: 'jane@example.com',
    signerOrder: 2,
    signerType: 'Approver',
  },
]

const rawTemplate: RawBoldsignTemplate = {
  templateId: 'tmpl-nda-001',
  templateName: 'NDA Template',
  templateDescription: 'Standard non-disclosure agreement',
  createdDate: CREATED_EPOCH,
  modifiedDate: MODIFIED_EPOCH,
  roles,
  files: [{}, {}],
  brandId: 'brand-x',
}

describe('boldsign transformTemplate', () => {
  it('maps id and externalId from templateId', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.id).toBe('tmpl-nda-001')
    expect(result.externalId).toBe('tmpl-nda-001')
  })

  it('falls back to documentId when templateId is absent', () => {
    const raw: RawBoldsignTemplate = {
      documentId: 'doc-fallback-id',
      templateName: 'Fallback Template',
    }
    const result = transformTemplate(raw)
    expect(result.id).toBe('doc-fallback-id')
    expect(result.externalId).toBe('doc-fallback-id')
  })

  it('maps name from templateName', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.name).toBe('NDA Template')
  })

  it('maps description from templateDescription', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.description).toBe('Standard non-disclosure agreement')
  })

  it('maps signerRoles from roleName fields', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.signerRoles).toEqual(['Signer', 'Approver'])
  })

  it('falls back to signerDetails when roles is absent', () => {
    const raw: RawBoldsignTemplate = {
      templateId: 'tmpl-002',
      templateName: 'Alt Template',
      signerDetails: [{ roleName: 'Counterparty' }, { defaultSignerName: 'FallbackName' }],
    }
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['Counterparty', 'FallbackName'])
  })

  it('maps documentCount from files array length', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.documentCount).toBe(2)
  })

  it('maps documentCount to 0 when files is absent', () => {
    const raw: RawBoldsignTemplate = {
      templateId: 'tmpl-003',
      templateName: 'No Files',
    }
    const result = transformTemplate(raw)
    expect(result.documentCount).toBe(0)
  })

  it('maps createdAt from createdDate epoch seconds', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.createdAt).toBe(new Date(CREATED_EPOCH * 1000).toISOString())
  })

  it('maps updatedAt from modifiedDate epoch seconds', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.updatedAt).toBe(new Date(MODIFIED_EPOCH * 1000).toISOString())
  })

  it('falls back to activityDate when modifiedDate is absent', () => {
    const ACTIVITY_EPOCH = 1710000000
    const raw: RawBoldsignTemplate = {
      templateId: 'tmpl-004',
      templateName: 'Activity Date Template',
      activityDate: ACTIVITY_EPOCH,
    }
    const result = transformTemplate(raw)
    expect(result.updatedAt).toBe(new Date(ACTIVITY_EPOCH * 1000).toISOString())
  })

  it('puts brandId into metadata', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.metadata.brandId).toBe('brand-x')
  })

  it('sets platform to boldsign', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.platform).toBe('boldsign')
  })

  it('passes TemplateSchema.parse without throwing', () => {
    const result = transformTemplate(rawTemplate)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('filters out roles with empty roleName and no defaultSignerName', () => {
    const raw: RawBoldsignTemplate = {
      templateId: 'tmpl-005',
      templateName: 'Sparse Roles',
      roles: [{ roleName: 'Signer' }, { roleName: '', defaultSignerName: '' }, {}],
    }
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['Signer'])
  })
})
