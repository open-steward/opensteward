import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawSignaturelyTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/signaturely/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('signaturely transformTemplate', () => {
  it('maps a template with signers and parts to canonical Template', () => {
    const raw: RawSignaturelyTemplate = {
      id: 'tmpl-001',
      title: 'NDA Agreement',
      message: 'Standard NDA template',
      type: 'template',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-06-01T00:00:00.000Z',
      signers: [
        { role: 'Counterparty', name: 'Counter Party' },
        { role: null, name: 'Witness' },
      ],
      parts: [{}],
    }
    const result = transformTemplate(raw)

    expect(result.id).toBe('tmpl-001')
    expect(result.externalId).toBe('tmpl-001')
    expect(result.name).toBe('NDA Agreement')
    expect(result.description).toBe('Standard NDA template')
    expect(result.signerRoles).toEqual(['Counterparty', 'Witness'])
    expect(result.documentCount).toBe(1)
    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(result.platform).toBe('signaturely')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to signer name when role is absent', () => {
    const raw: RawSignaturelyTemplate = {
      id: 'tmpl-002',
      signers: [{ role: null, name: 'Approver' }],
      parts: [],
    }
    const result = transformTemplate(raw)

    expect(result.signerRoles).toEqual(['Approver'])
    expect(result.documentCount).toBe(0)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('produces empty signerRoles and zero documentCount when arrays are absent', () => {
    const raw: RawSignaturelyTemplate = {
      id: 'tmpl-003',
    }
    const result = transformTemplate(raw)

    expect(result.signerRoles).toEqual([])
    expect(result.documentCount).toBe(0)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
