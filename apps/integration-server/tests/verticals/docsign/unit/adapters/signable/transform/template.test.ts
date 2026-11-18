import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawSignableTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/signable/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('signable transformTemplate', () => {
  it('maps a Signable template to canonical Template', () => {
    const raw: RawSignableTemplate = {
      template_fingerprint: 'tmpl-fp-001',
      template_id: 'tmpl-id-001',
      template_title: 'NDA Template',
      template_page_total: '5',
      template_parties_total: '2',
      template_uploaded: '2026-01-05T08:00:00+0000',
      template_parties: [
        { party_id: 'p1', party_name: 'Buyer' },
        { party_id: 'p2', party_name: 'Seller' },
      ],
    }

    const result = transformTemplate(raw)

    // id maps from template_fingerprint
    expect(result.id).toBe('tmpl-fp-001')
    expect(result.externalId).toBe('tmpl-fp-001')
    expect(result.name).toBe('NDA Template')
    // signerRoles from template_parties[*].party_name
    expect(result.signerRoles).toEqual(['Buyer', 'Seller'])
    // Signable template wraps a single document
    expect(result.documentCount).toBe(1)
    expect(result.platform).toBe('signable')
    expect(result.metadata.templateId).toBe('tmpl-id-001')
    expect(result.metadata.pageTotal).toBe('5')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('produces empty signerRoles when template_parties absent', () => {
    const raw: RawSignableTemplate = {
      template_fingerprint: 'tmpl-fp-2',
      template_title: 'Blank',
    }
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual([])
    expect(result.documentCount).toBe(1)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('excludes parties with no party_name from signerRoles', () => {
    const raw: RawSignableTemplate = {
      template_fingerprint: 'tmpl-fp-3',
      template_parties: [{ party_id: 'p1', party_name: 'Signer' }, { party_id: 'p2' }],
    }
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['Signer'])
  })
})
