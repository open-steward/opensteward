import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawPdffillerRecipient,
} from '../../../../../../../src/verticals/docsign/adapters/pdffiller/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('pdffiller transformSigner', () => {
  const raw: RawPdffillerRecipient = {
    id: 42,
    user_id: 9,
    email: 'jane@example.com',
    name: 'Jane Doe',
    order: 1,
    status: 'SIGNED',
    date_created: '2026-01-10T08:00:00.000Z',
    date_signed: '2026-01-15T12:00:00.000Z',
    message_subject: 'Please sign',
    message_text: 'Review and sign.',
    access: 'full',
    require_photo: false,
  }

  const envelopeId = 'env_101'

  it('constructs id as envelopeId:recipientId', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.id).toBe('env_101:42')
    expect(result.externalId).toBe('42')
  })

  it('maps email and name', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
  })

  it('maps SIGNED status to signed', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.status).toBe('signed')
  })

  it('maps NOT_SENT status to created', () => {
    const result = transformSigner({ ...raw, status: 'NOT_SENT' }, envelopeId)
    expect(result.status).toBe('created')
  })

  it('maps DECLINED status to declined', () => {
    const result = transformSigner({ ...raw, status: 'DECLINED' }, envelopeId)
    expect(result.status).toBe('declined')
  })

  it('maps IN_PROGRESS status to sent', () => {
    const result = transformSigner({ ...raw, status: 'IN_PROGRESS' }, envelopeId)
    expect(result.status).toBe('sent')
  })

  it('always maps role to signer (pdfFiller has no distinct role)', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.role).toBe('signer')
  })

  it('maps routingOrder from order field', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.routingOrder).toBe(1)
  })

  it('maps signedAt as ISO datetime', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.signedAt).toBe('2026-01-15T12:00:00.000Z')
  })

  it('sets platform to pdffiller', () => {
    const result = transformSigner(raw, envelopeId)
    expect(result.platform).toBe('pdffiller')
  })

  it('falls back to email as externalId when id is absent', () => {
    const result = transformSigner({ ...raw, id: undefined }, envelopeId)
    expect(result.externalId).toBe('jane@example.com')
    expect(result.id).toBe('env_101:jane@example.com')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const result = transformSigner(raw, envelopeId)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
