import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawSignPlusTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/sign-plus/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('sign-plus transformTemplate', () => {
  it('maps a full template to canonical Template', () => {
    const raw: RawSignPlusTemplate = {
      id: 'tmpl-001',
      name: 'NDA Template',
      comment: 'Standard non-disclosure agreement.',
      pages: 3,
      legality_level: 'AES',
      created_at: 1735689600, // 2025-01-01T00:00:00Z
      updated_at: 1735776000, // 2025-01-02T00:00:00Z
      expiration_delay: 30,
      num_recipients: 2,
      signing_steps: [
        { recipients: [{ id: 'r1', role: 'SIGNER' }] },
        { recipients: [{ id: 'r2', role: 'RECEIVES_COPY' }] },
      ],
      documents: [{ id: 'doc-1' }],
      dynamic_fields: ['company_name', 'date'],
    }

    const result = transformTemplate(raw)

    // id maps from raw.id
    expect(result.id).toBe('tmpl-001')
    expect(result.externalId).toBe('tmpl-001')
    expect(result.name).toBe('NDA Template')
    expect(result.description).toBe('Standard non-disclosure agreement.')
    // distinct roles from all signing steps
    expect(result.signerRoles).toContain('SIGNER')
    expect(result.signerRoles).toContain('RECEIVES_COPY')
    expect(result.signerRoles).toHaveLength(2)
    // documentCount from documents array length
    expect(result.documentCount).toBe(1)
    expect(result.platform).toBe('sign-plus')
    expect(result.metadata.legalityLevel).toBe('AES')
    expect(result.metadata.dynamicFields).toBe('company_name,date')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('produces empty signerRoles and zero documentCount when arrays absent', () => {
    const result = transformTemplate({ id: 'tmpl-2' })
    expect(result.signerRoles).toEqual([])
    expect(result.documentCount).toBe(0)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('deduplicates signer roles across signing steps', () => {
    const raw: RawSignPlusTemplate = {
      id: 'tmpl-3',
      signing_steps: [
        { recipients: [{ id: 'r1', role: 'SIGNER' }] },
        { recipients: [{ id: 'r2', role: 'SIGNER' }] },
      ],
    }
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['SIGNER'])
  })
})
