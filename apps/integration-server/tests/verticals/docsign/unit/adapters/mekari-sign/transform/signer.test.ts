import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/mekari-sign/transform/signer'
import type { RawMekariSignSigner } from '../../../../../../../src/verticals/docsign/adapters/mekari-sign/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('mekari-sign transformSigner', () => {
  const raw: RawMekariSignSigner = {
    id: 'sig_001',
    email: 'alice@example.com',
    name: 'Alice Smith',
    order: 1,
    status: 'signed',
    signed_at: '2024-01-20T14:30:00.000Z',
    viewed_at: '2024-01-20T10:00:00.000Z',
    sent_at: '2024-01-15T10:05:00.000Z',
  }

  it('maps id as envelopeId:externalId composite', () => {
    const result = transformSigner(raw, 'mek_doc_001', 0)
    expect(result.id).toBe('mek_doc_001:sig_001')
  })

  it('maps externalId from id field', () => {
    const result = transformSigner(raw, 'mek_doc_001', 0)
    expect(result.externalId).toBe('sig_001')
  })

  it('falls back to email as externalId when id is absent', () => {
    const result = transformSigner({ ...raw, id: undefined }, 'mek_doc_001', 0)
    expect(result.externalId).toBe('alice@example.com')
  })

  it('falls back to index string as externalId when id and email are absent', () => {
    const result = transformSigner({ ...raw, id: undefined, email: undefined }, 'mek_doc_001', 3)
    expect(result.externalId).toBe('3')
  })

  it('maps envelopeId from parameter', () => {
    const result = transformSigner(raw, 'mek_doc_001', 0)
    expect(result.envelopeId).toBe('mek_doc_001')
  })

  it('maps email from email field', () => {
    const result = transformSigner(raw, 'mek_doc_001', 0)
    expect(result.email).toBe('alice@example.com')
  })

  it('maps name from name field', () => {
    const result = transformSigner(raw, 'mek_doc_001', 0)
    expect(result.name).toBe('Alice Smith')
  })

  it('falls back to full_name when name is absent', () => {
    const result = transformSigner(
      { ...raw, name: undefined, full_name: 'Alice Full' },
      'mek_doc_001',
      0,
    )
    expect(result.name).toBe('Alice Full')
  })

  it('maps role to signer', () => {
    const result = transformSigner(raw, 'mek_doc_001', 0)
    expect(result.role).toBe('signer')
  })

  it('maps status signed → signed', () => {
    const result = transformSigner(raw, 'mek_doc_001', 0)
    expect(result.status).toBe('signed')
  })

  it('maps status completed → signed', () => {
    const result = transformSigner({ ...raw, status: 'completed' }, 'mek_doc_001', 0)
    expect(result.status).toBe('signed')
  })

  it('maps status declined → declined', () => {
    const result = transformSigner({ ...raw, status: 'declined' }, 'mek_doc_001', 0)
    expect(result.status).toBe('declined')
  })

  it('maps status viewed → delivered', () => {
    const result = transformSigner({ ...raw, status: 'viewed' }, 'mek_doc_001', 0)
    expect(result.status).toBe('delivered')
  })

  it('maps status sent → sent', () => {
    const result = transformSigner({ ...raw, status: 'sent' }, 'mek_doc_001', 0)
    expect(result.status).toBe('sent')
  })

  it('maps status in_progress → sent', () => {
    const result = transformSigner({ ...raw, status: 'in_progress' }, 'mek_doc_001', 0)
    expect(result.status).toBe('sent')
  })

  it('maps unknown status → created', () => {
    const result = transformSigner({ ...raw, status: undefined }, 'mek_doc_001', 0)
    expect(result.status).toBe('created')
  })

  it('maps routingOrder from order field (≥ 1)', () => {
    const result = transformSigner(raw, 'mek_doc_001', 0)
    expect(result.routingOrder).toBe(1)
  })

  it('omits routingOrder when order is 0', () => {
    const result = transformSigner({ ...raw, order: 0 }, 'mek_doc_001', 0)
    expect(result.routingOrder).toBeUndefined()
  })

  it('maps signedAt from signed_at field', () => {
    const result = transformSigner(raw, 'mek_doc_001', 0)
    expect(result.signedAt).toBe('2024-01-20T14:30:00.000Z')
  })

  it('maps deliveredAt from viewed_at field', () => {
    const result = transformSigner(raw, 'mek_doc_001', 0)
    expect(result.deliveredAt).toBe('2024-01-20T10:00:00.000Z')
  })

  it('maps sentAt from sent_at field', () => {
    const result = transformSigner(raw, 'mek_doc_001', 0)
    expect(result.sentAt).toBe('2024-01-15T10:05:00.000Z')
  })

  it('sets platform to mekari-sign', () => {
    const result = transformSigner(raw, 'mek_doc_001', 0)
    expect(result.platform).toBe('mekari-sign')
  })

  it('includes rawStatus in metadata', () => {
    const result = transformSigner(raw, 'mek_doc_001', 0)
    expect(result.metadata.rawStatus).toBe('signed')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const result = transformSigner(raw, 'mek_doc_001', 0)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
