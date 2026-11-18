import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawEsignglobalTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/esignglobal/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('esignglobal transformTemplate', () => {
  it('maps a PDF template with fields and metadata', () => {
    const raw: RawEsignglobalTemplate = {
      templateId: 'tmpl-abc',
      templateName: 'NDA Template',
      templateType: 0, // PDF
      templateStatus: 1, // Enabled
      owner: 'admin@example.com',
      createTime: 1693974363460,
      updateTime: 1694060763460,
      fields: [
        { fieldId: 'f1', fieldName: 'Signatory Name', fieldType: 1 },
        { fieldId: 'f2', fieldName: 'Date', fieldType: 3 },
      ],
    }
    const result = transformTemplate(raw)

    expect(result.id).toBe('tmpl-abc')
    expect(result.externalId).toBe('tmpl-abc')
    expect(result.name).toBe('NDA Template')
    // eSignGlobal templates have no named signer roles
    expect(result.signerRoles).toEqual([])
    // One source document per template
    expect(result.documentCount).toBe(1)
    expect(result.createdAt).toBeDefined()
    expect(result.updatedAt).toBeDefined()
    expect(result.platform).toBe('esignglobal')
    // templateType 0 → 'PDF' in metadata
    expect(result.metadata['templateType']).toBe('PDF')
    // 2 fields → fieldCount=2 in metadata
    expect(result.metadata['fieldCount']).toBe('2')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('maps a WORD template (templateType=1)', () => {
    const raw: RawEsignglobalTemplate = {
      templateId: 'tmpl-word',
      templateName: 'Contract Template',
      templateType: 1, // WORD
      templateStatus: 0, // Not Enabled
    }
    const result = transformTemplate(raw)

    expect(result.id).toBe('tmpl-word')
    expect(result.metadata['templateType']).toBe('WORD')
    expect(result.metadata['templateStatus']).toBe('0')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('handles template with no fields or timestamps', () => {
    const raw: RawEsignglobalTemplate = {
      templateId: 'tmpl-minimal',
    }
    const result = transformTemplate(raw)

    expect(result.id).toBe('tmpl-minimal')
    expect(result.name).toBe('')
    expect(result.signerRoles).toEqual([])
    expect(result.documentCount).toBe(1)
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
