import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawDocumensoTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/documenso/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('documenso transformTemplate', () => {
  it('maps a full template with recipients', () => {
    const raw: RawDocumensoTemplate = {
      id: 7,
      externalId: 'ext-7',
      type: 'PUBLIC',
      title: 'NDA Template',
      userId: 3,
      teamId: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-06-01T00:00:00.000Z',
      templateMeta: {
        subject: 'Please sign the NDA',
        message: 'Standard NDA for new partners.',
        signingOrder: 'SEQUENTIAL',
        redirectUrl: 'https://example.com/thanks',
      },
      recipients: [
        { role: 'SIGNER', name: 'Counterparty', email: 'cp@example.com' },
        { role: 'CC', name: 'Legal', email: 'legal@example.com' },
      ],
    }
    const result = transformTemplate(raw)

    expect(result.id).toBe('7')
    expect(result.externalId).toBe('ext-7')
    expect(result.name).toBe('NDA Template')
    // description comes from templateMeta.message
    expect(result.description).toBe('Standard NDA for new partners.')
    expect(result.signerRoles).toEqual(['SIGNER', 'CC'])
    // Documenso always reports documentCount as 1
    expect(result.documentCount).toBe(1)
    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2025-06-01T00:00:00.000Z')
    expect(result.platform).toBe('documenso')
    expect(result.metadata.type).toBe('PUBLIC')
    expect(result.metadata.signingOrder).toBe('SEQUENTIAL')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to Recipient array (Prisma relation name) when recipients absent', () => {
    const raw: RawDocumensoTemplate = {
      id: 8,
      title: 'Service Agreement',
      Recipient: [
        { role: 'SIGNER', name: 'Client' },
        { role: 'APPROVER', name: 'Manager' },
      ],
    }
    const result = transformTemplate(raw)

    expect(result.signerRoles).toEqual(['SIGNER', 'APPROVER'])
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('uses string numeric id as externalId fallback when externalId absent', () => {
    const raw: RawDocumensoTemplate = {
      id: 99,
      title: 'Minimal',
    }
    const result = transformTemplate(raw)

    expect(result.id).toBe('99')
    expect(result.externalId).toBe('99')
    expect(result.signerRoles).toEqual([])
    expect(result.documentCount).toBe(1)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('metadata includes teamId when present', () => {
    const raw: RawDocumensoTemplate = {
      id: 15,
      title: 'Team Template',
      teamId: 5,
    }
    const result = transformTemplate(raw)

    expect(result.metadata.teamId).toBe('5')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
