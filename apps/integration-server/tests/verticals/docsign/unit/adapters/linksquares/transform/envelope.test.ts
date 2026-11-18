import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawLinksquaresAgreement,
  type RawLinksquaresParty,
  type RawLinksquaresVersion,
} from '../../../../../../../src/verticals/docsign/adapters/linksquares/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('linksquares transformEnvelope', () => {
  const parties: RawLinksquaresParty[] = [
    { id: 'party-1', email: 'alice@example.com', name: 'Alice', role: 'signer', signing_order: 1 },
    { id: 'party-2', email: 'bob@example.com', name: 'Bob', role: 'signer', signing_order: 2 },
  ]

  const versions: RawLinksquaresVersion[] = [
    {
      id: 'ver-1',
      file_name: 'Agreement_v1.pdf',
      page_count: 5,
      file_size: 102400,
      content_type: 'application/pdf',
    },
  ]

  const raw: RawLinksquaresAgreement = {
    id: 77,
    name: 'Software License Agreement',
    description: 'Annual SaaS subscription.',
    status: 'fully_signed',
    signing_order: 'sequential',
    creator_id: 'usr-01',
    creator_email: 'admin@example.com',
    creator_name: 'Admin User',
    template_id: 'tmpl-99',
    parties,
    agreement_versions: versions,
    created_at: '2025-07-01T08:00:00.000Z',
    sent_at: '2025-07-02T09:00:00.000Z',
    executed_at: '2025-07-10T16:00:00.000Z',
    expires_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2025-07-10T16:00:00.000Z',
  }

  it('maps id to string id and externalId', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('77')
    expect(result.externalId).toBe('77')
  })

  it('maps fully_signed status to completed', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
  })

  it('maps name to subject', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('Software License Agreement')
  })

  it('maps description to message', () => {
    const result = transformEnvelope(raw)
    expect(result.message).toBe('Annual SaaS subscription.')
  })

  it('maps creator_id, creator_email, creator_name', () => {
    const result = transformEnvelope(raw)
    expect(result.senderId).toBe('usr-01')
    expect(result.senderEmail).toBe('admin@example.com')
    expect(result.senderName).toBe('Admin User')
  })

  it('maps signing_order=sequential to sequential', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('maps party ids to signerIds', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['party-1', 'party-2'])
  })

  it('maps agreement_versions to documentIds', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['ver-1'])
  })

  it('maps template_id to templateId', () => {
    const result = transformEnvelope(raw)
    expect(result.templateId).toBe('tmpl-99')
  })

  it('maps all date fields correctly', () => {
    const result = transformEnvelope(raw)
    expect(result.createdAt).toBe('2025-07-01T08:00:00.000Z')
    expect(result.sentAt).toBe('2025-07-02T09:00:00.000Z')
    expect(result.completedAt).toBe('2025-07-10T16:00:00.000Z')
    expect(result.expiresAt).toBe('2026-07-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2025-07-10T16:00:00.000Z')
  })

  it('sets platform to linksquares', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('linksquares')
  })

  it('does not set completedAt when status is not completed', () => {
    const result = transformEnvelope({ ...raw, status: 'out_for_signature' })
    expect(result.completedAt).toBeUndefined()
  })

  it('maps declined status correctly', () => {
    const result = transformEnvelope({ ...raw, status: 'declined' })
    expect(result.status).toBe('declined')
  })

  it('maps cancelled/void status to voided', () => {
    const result = transformEnvelope({ ...raw, status: 'cancelled' })
    expect(result.status).toBe('voided')
  })

  it('maps expired status correctly', () => {
    const result = transformEnvelope({ ...raw, status: 'expired' })
    expect(result.status).toBe('expired')
  })

  it('maps draft/request_pending to draft', () => {
    const result = transformEnvelope({ ...raw, status: 'draft' })
    expect(result.status).toBe('draft')
  })

  it('maps out_for_signature to sent', () => {
    const result = transformEnvelope({ ...raw, status: 'out_for_signature' })
    expect(result.status).toBe('sent')
  })

  it('maps parallel signing_order to parallel', () => {
    const result = transformEnvelope({ ...raw, signing_order: 'parallel' })
    expect(result.signingOrder).toBe('parallel')
  })

  it('passes EnvelopeSchema validation', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
