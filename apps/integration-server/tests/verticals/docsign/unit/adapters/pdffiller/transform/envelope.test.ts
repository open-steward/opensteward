import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawPdffillerSignatureRequest,
} from '../../../../../../../src/verticals/docsign/adapters/pdffiller/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('pdffiller transformEnvelope', () => {
  const raw: RawPdffillerSignatureRequest = {
    signature_request_id: 101,
    document_id: 55,
    envelope_name: 'NDA 2026',
    status: 'SIGNED',
    method: 'sequential',
    sign_in_order: true,
    security_pin: '1234',
    owner: { id: 99, email: 'owner@example.com', name: 'Alice Owner' },
    recipients: [
      { id: 1, email: 'bob@example.com', name: 'Bob', order: 1, status: 'SIGNED' },
      { id: 2, email: 'carol@example.com', name: 'Carol', order: 2, status: 'SENT' },
    ],
    date_created: '2026-01-10T08:00:00.000Z',
    date_signed: '2026-01-15T12:00:00.000Z',
  }

  it('maps id from signature_request_id', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps SIGNED status to completed', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
  })

  it('maps NOT_SENT status to draft', () => {
    const result = transformEnvelope({ ...raw, status: 'NOT_SENT' })
    expect(result.status).toBe('draft')
  })

  it('maps IN_PROGRESS status to delivered', () => {
    const result = transformEnvelope({ ...raw, status: 'IN_PROGRESS' })
    expect(result.status).toBe('delivered')
  })

  it('maps SENT status to sent', () => {
    const result = transformEnvelope({ ...raw, status: 'SENT' })
    expect(result.status).toBe('sent')
  })

  it('maps DECLINED status to declined', () => {
    const result = transformEnvelope({ ...raw, status: 'DECLINED' })
    expect(result.status).toBe('declined')
  })

  it('maps subject from envelope_name', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('NDA 2026')
  })

  it('maps sender fields from owner', () => {
    const result = transformEnvelope(raw)
    expect(result.senderId).toBe('99')
    expect(result.senderEmail).toBe('owner@example.com')
    expect(result.senderName).toBe('Alice Owner')
  })

  it('maps sign_in_order:true → sequential', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('maps sign_in_order:false → parallel', () => {
    const result = transformEnvelope({ ...raw, sign_in_order: false })
    expect(result.signingOrder).toBe('parallel')
  })

  it('maps signerIds from recipients sorted by order', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['1', '2'])
  })

  it('maps documentIds from document_id', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['55'])
  })

  it('maps createdAt as ISO datetime', () => {
    const result = transformEnvelope(raw)
    expect(result.createdAt).toBe('2026-01-10T08:00:00.000Z')
  })

  it('maps completedAt when status is completed', () => {
    const result = transformEnvelope(raw)
    expect(result.completedAt).toBe('2026-01-15T12:00:00.000Z')
  })

  it('does not set completedAt when status is not completed', () => {
    const result = transformEnvelope({ ...raw, status: 'SENT' })
    expect(result.completedAt).toBeUndefined()
  })

  it('sets platform to pdffiller', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('pdffiller')
  })

  it('includes rawStatus in metadata', () => {
    const result = transformEnvelope(raw)
    expect(result.metadata.rawStatus).toBe('SIGNED')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
