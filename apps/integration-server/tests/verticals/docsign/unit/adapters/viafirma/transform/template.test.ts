import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawViafirmaTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/viafirma/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('viafirma transformTemplate', () => {
  it('maps a Viafirma template to canonical Template', () => {
    const raw: RawViafirmaTemplate = {
      code: 'tmpl-001',
      title: 'NDA Template',
      description: 'Standard non-disclosure agreement.',
      creationDate: 1735689600000,
      groups: 'Legal',
      onlyWacom: false,
      version: '2.1',
    }

    const result = transformTemplate(raw)

    expect(result.id).toBe('tmpl-001')
    expect(result.externalId).toBe('tmpl-001')
    expect(result.name).toBe('NDA Template')
    expect(result.description).toBe('Standard non-disclosure agreement.')
    // viafirma has no signer-role breakdown on templates
    expect(result.signerRoles).toEqual([])
    expect(result.documentCount).toBe(0)
    expect(result.createdAt).toBeDefined()
    expect(result.platform).toBe('viafirma')
    expect(result.metadata.version).toBe('2.1')
    expect(result.metadata.groups).toBe('Legal')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('produces valid template with minimal fields', () => {
    const raw: RawViafirmaTemplate = { code: 'tmpl-min' }
    const result = transformTemplate(raw)
    expect(result.name).toBe('')
    expect(result.description).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('parses epoch-ms creationDate to ISO string', () => {
    const raw: RawViafirmaTemplate = { code: 'tmpl-ts', creationDate: 1735689600000 }
    const result = transformTemplate(raw)
    // toIso on epoch-ms should produce a valid ISO string ending in Z
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})
