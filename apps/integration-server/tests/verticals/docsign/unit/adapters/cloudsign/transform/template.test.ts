/**
 * CloudSign has no dedicated template endpoint or template-shaped payload
 * — a "template" is a documentModel with status=4, so this transform
 * reads title/note/message/participants/files instead of the old
 * (undocumented) description/participant_roles shape.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawCloudSignTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/cloudsign/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('cloudsign transformTemplate', () => {
  it('maps a status=4 documentModel to a canonical Template and round-trips through the schema', () => {
    const raw: RawCloudSignTemplate = {
      id: 'doc_tmpl_1',
      title: 'NDA Template',
      note: 'Standard NDA for new partners',
      status: 4,
      participants: [
        { id: 'p1', name: 'Counterparty', email: 'c@example.com' },
        { id: 'p2', email: 'w@example.com' },
      ],
      files: [{ id: 'f1', name: 'nda.pdf' }, { id: 'f2', name: 'appendix.pdf' }],
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-02-01T00:00:00Z',
    }

    const out = transformTemplate(raw)
    const parsed = TemplateSchema.parse(out)

    expect(parsed).toMatchObject({
      id: 'doc_tmpl_1',
      externalId: 'doc_tmpl_1',
      name: 'NDA Template',
      description: 'Standard NDA for new partners',
      signerRoles: ['Counterparty', 'w@example.com'],
      documentCount: 2,
      platform: 'cloudsign',
    })
    expect(parsed.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(parsed.updatedAt).toBe('2025-02-01T00:00:00.000Z')
    expect(parsed.raw).toBe(raw)
  })

  it('falls back to message when note is absent, and to an empty template when the rest is missing', () => {
    const raw: RawCloudSignTemplate = { id: 'doc_tmpl_2', status: 4, message: 'from message' }
    const out = transformTemplate(raw)
    const parsed = TemplateSchema.parse(out)

    expect(parsed.description).toBe('from message')
    expect(parsed.name).toBe('')
    expect(parsed.signerRoles).toEqual([])
    expect(parsed.documentCount).toBe(0)
  })
})
