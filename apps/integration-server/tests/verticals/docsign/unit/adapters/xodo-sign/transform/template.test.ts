import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawXodoSignTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/xodo-sign/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('xodo-sign transformTemplate', () => {
  it('maps a Xodo Sign template document to canonical Template', () => {
    const raw: RawXodoSignTemplate = {
      document_hash: 'tmpl-hash-001',
      title: 'Employee NDA',
      message: 'Standard NDA for new employees.',
      is_template: true,
      created: 1735689600,
      signers: [
        { id: 1, role: 'Employee' },
        { id: 2, role: 'Legal Rep' },
      ],
      files: [
        { file_id: 'f1', name: 'nda.pdf' },
        { file_id: 'f2', name: 'annex.pdf' },
      ],
    }

    const result = transformTemplate(raw)

    expect(result.id).toBe('tmpl-hash-001')
    expect(result.externalId).toBe('tmpl-hash-001')
    expect(result.name).toBe('Employee NDA')
    expect(result.description).toBe('Standard NDA for new employees.')
    // signer roles extracted from signers[].role
    expect(result.signerRoles).toEqual(['Employee', 'Legal Rep'])
    // file count = documentCount
    expect(result.documentCount).toBe(2)
    expect(result.createdAt).toBeDefined()
    expect(result.platform).toBe('xodo-sign')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('filters out signers with no role', () => {
    const raw: RawXodoSignTemplate = {
      document_hash: 'tmpl-2',
      signers: [
        { id: 1, role: 'Manager' },
        { id: 2 }, // no role
      ],
      files: [],
    }
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['Manager'])
    expect(result.documentCount).toBe(0)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('produces valid template with minimal fields', () => {
    const raw: RawXodoSignTemplate = { document_hash: 'tmpl-min' }
    const result = transformTemplate(raw)
    expect(result.name).toBe('')
    expect(result.signerRoles).toEqual([])
    expect(result.documentCount).toBe(0)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
