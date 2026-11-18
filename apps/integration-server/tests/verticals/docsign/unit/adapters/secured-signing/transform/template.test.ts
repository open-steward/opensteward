import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawSecuredSigningEmailTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/secured-signing/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('secured-signing transformTemplate', () => {
  const raw: RawSecuredSigningEmailTemplate = {
    Reference: 'ETMPL-001',
    Name: 'Invitation Email',
    Subject: 'Please sign your document',
    Template: '<p>Dear {{name}}, please sign.</p>',
    IsDefault: true,
  }

  it('maps id and externalId from Reference', () => {
    const result = transformTemplate(raw)
    expect(result.id).toBe('ETMPL-001')
    expect(result.externalId).toBe('ETMPL-001')
  })

  it('maps name from Name', () => {
    const result = transformTemplate(raw)
    expect(result.name).toBe('Invitation Email')
  })

  it('maps description from Subject', () => {
    const result = transformTemplate(raw)
    expect(result.description).toBe('Please sign your document')
  })

  it('sets signerRoles to empty array', () => {
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual([])
  })

  it('sets documentCount to 0 (email templates have no documents)', () => {
    const result = transformTemplate(raw)
    expect(result.documentCount).toBe(0)
  })

  it('sets platform to secured-signing', () => {
    const result = transformTemplate(raw)
    expect(result.platform).toBe('secured-signing')
  })

  it('includes subject and isDefault in metadata', () => {
    const result = transformTemplate(raw)
    expect(result.metadata.subject).toBe('Please sign your document')
    expect(result.metadata.isDefault).toBe('true')
  })

  it('passes TemplateSchema.parse without throwing', () => {
    const result = transformTemplate(raw)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
