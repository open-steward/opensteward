import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawOpensignTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/opensign/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('opensign transformTemplate', () => {
  const raw: RawOpensignTemplate = {
    objectId: 'tpl_os_001',
    Name: 'NDA Template',
    Description: 'Standard non-disclosure agreement',
    Note: 'Note text',
    URL: 'https://opensign.example/templates/tpl_os_001.pdf',
    SendinOrder: true,
    Placeholders: [
      { Role: 'Counterparty', signerObjId: 'sig_1' },
      { Role: 'Witness', signerObjId: 'sig_2' },
    ],
    Signers: [{ objectId: 'sig_1', Name: 'Counterparty Signer', Role: 'Counterparty' }],
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-20T14:30:00.000Z',
  }

  it('maps id and externalId from objectId', () => {
    const result = transformTemplate(raw)
    expect(result.id).toBe('tpl_os_001')
    expect(result.externalId).toBe('tpl_os_001')
  })

  it('maps name from Name field', () => {
    const result = transformTemplate(raw)
    expect(result.name).toBe('NDA Template')
  })

  it('maps description from Description field', () => {
    const result = transformTemplate(raw)
    expect(result.description).toBe('Standard non-disclosure agreement')
  })

  it('falls back to Note when Description is absent', () => {
    const result = transformTemplate({ ...raw, Description: undefined })
    expect(result.description).toBe('Note text')
  })

  it('maps signerRoles from Placeholders when present', () => {
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['Counterparty', 'Witness'])
  })

  it('deduplicates placeholder roles', () => {
    const result = transformTemplate({
      ...raw,
      Placeholders: [{ Role: 'Signer' }, { Role: 'Signer' }, { Role: 'Witness' }],
    })
    expect(result.signerRoles).toEqual(['Signer', 'Witness'])
  })

  it('falls back to Signers array when Placeholders is empty', () => {
    const result = transformTemplate({ ...raw, Placeholders: [] })
    expect(result.signerRoles).toEqual(['Counterparty'])
  })

  it('maps documentCount to 1 when URL is present', () => {
    const result = transformTemplate(raw)
    expect(result.documentCount).toBe(1)
  })

  it('maps documentCount to 0 when URL and SignedUrl are absent', () => {
    const result = transformTemplate({ ...raw, URL: undefined, SignedUrl: undefined })
    expect(result.documentCount).toBe(0)
  })

  it('maps createdAt from plain ISO string', () => {
    const result = transformTemplate(raw)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('maps updatedAt from plain ISO string', () => {
    const result = transformTemplate(raw)
    expect(result.updatedAt).toBe('2024-01-20T14:30:00.000Z')
  })

  it('sets platform to opensign', () => {
    const result = transformTemplate(raw)
    expect(result.platform).toBe('opensign')
  })

  it('includes sendinOrder and signerCount in metadata', () => {
    const result = transformTemplate(raw)
    expect(result.metadata.sendinOrder).toBe('true')
    expect(result.metadata.signerCount).toBe('1')
  })

  it('passes TemplateSchema.parse without throwing', () => {
    const result = transformTemplate(raw)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
