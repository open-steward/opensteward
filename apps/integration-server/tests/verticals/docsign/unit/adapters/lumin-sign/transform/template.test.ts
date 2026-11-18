import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawLuminSignTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/lumin-sign/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('lumin-sign transformTemplate', () => {
  const raw: RawLuminSignTemplate = {
    template_id: 'tpl_lumin_001',
    type: 'standard',
    name: 'NDA Template',
    signing_type: 'ORDER',
    signer_roles: [
      { name: 'Counterparty', group: 1 },
      { name: 'Witness', group: 2 },
    ],
    tags: [{ name: 'legal', type: 'tag', is_required: false }],
    fields: [{ name: 'name', type: 'text', is_required: true, assigned_role: 'Counterparty' }],
    created_at: 1700000000000,
    updated_at: 1700001000000,
  }

  it('maps id and externalId from template_id', () => {
    const result = transformTemplate(raw)
    expect(result.id).toBe('tpl_lumin_001')
    expect(result.externalId).toBe('tpl_lumin_001')
  })

  it('maps name from name field', () => {
    const result = transformTemplate(raw)
    expect(result.name).toBe('NDA Template')
  })

  it('maps empty string name when name is absent', () => {
    const result = transformTemplate({ ...raw, name: undefined })
    expect(result.name).toBe('')
  })

  it('maps signerRoles from signer_roles names', () => {
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['Counterparty', 'Witness'])
  })

  it('maps empty signerRoles when signer_roles is absent', () => {
    const result = transformTemplate({ ...raw, signer_roles: undefined })
    expect(result.signerRoles).toEqual([])
  })

  it('filters out signer roles with no name', () => {
    const result = transformTemplate({
      ...raw,
      signer_roles: [{ name: 'Signer', group: 1 }, { group: 2 }],
    })
    expect(result.signerRoles).toEqual(['Signer'])
  })

  it('maps documentCount to 0 (Lumin templates have no doc count)', () => {
    const result = transformTemplate(raw)
    expect(result.documentCount).toBe(0)
  })

  it('maps createdAt from epoch-ms timestamp', () => {
    const result = transformTemplate(raw)
    expect(result.createdAt).toBe(new Date(1700000000000).toISOString())
  })

  it('maps updatedAt from epoch-ms timestamp', () => {
    const result = transformTemplate(raw)
    expect(result.updatedAt).toBe(new Date(1700001000000).toISOString())
  })

  it('sets platform to lumin-sign', () => {
    const result = transformTemplate(raw)
    expect(result.platform).toBe('lumin-sign')
  })

  it('includes type and signingType in metadata', () => {
    const result = transformTemplate(raw)
    expect(result.metadata.type).toBe('standard')
    expect(result.metadata.signingType).toBe('ORDER')
  })

  it('includes fieldCount and tagCount in metadata', () => {
    const result = transformTemplate(raw)
    expect(result.metadata.fieldCount).toBe('1')
    expect(result.metadata.tagCount).toBe('1')
  })

  it('passes TemplateSchema.parse without throwing', () => {
    const result = transformTemplate(raw)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
