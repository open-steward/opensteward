import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/comsigntrust/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { signer, COLLECTION_ID, SIGNER_ID_1 } from '../fixtures/wesign'

describe('comsigntrust/transform/signer (SignerResponseDTO)', () => {
  it('parses against the canonical SignerSchema', () => {
    const out = SignerSchema.parse(transformSigner(signer(), COLLECTION_ID))
    expect(out.id).toBe(`${COLLECTION_ID}:${SIGNER_ID_1}`)
    expect(out.externalId).toBe(SIGNER_ID_1)
    expect(out.envelopeId).toBe(COLLECTION_ID)
    expect(out.name).toBe('Dana Levi')
    expect(out.email).toBe('dana.levi@example.com')
    expect(out.role).toBe('signer')
    expect(out.metadata).toEqual({ sendingMethod: 'email' })
  })

  it.each([
    [1, 'sent'],
    [2, 'delivered'],
    [3, 'signed'],
    [4, 'declined'],
    [99, 'unknown'],
  ] as const)('maps SignerStatus %i → %s', (status, expected) => {
    expect(SignerSchema.parse(transformSigner(signer({ status }), COLLECTION_ID)).status).toBe(
      expected,
    )
  })

  it('reads the time* fields and drops year-1 placeholders', () => {
    const out = SignerSchema.parse(transformSigner(signer(), COLLECTION_ID))
    expect(out.sentAt).toBe('2026-03-01T08:00:00.000Z')
    expect(out.deliveredAt).toBe('2026-03-01T09:15:00.000Z')
    expect(out.signedAt).toBe('2026-03-01T09:20:00.000Z')
    expect(out.declinedAt).toBeUndefined()
  })

  it('reads timeRejected into declinedAt on a rejected signer', () => {
    const out = SignerSchema.parse(
      transformSigner(
        signer({
          status: 4,
          timeSigned: '0001-01-01T00:00:00',
          timeRejected: '2026-03-02T11:30:00',
        }),
        COLLECTION_ID,
      ),
    )
    expect(out.status).toBe('declined')
    expect(out.declinedAt).toBe('2026-03-02T11:30:00.000Z')
    expect(out.signedAt).toBeUndefined()
  })

  it('leaves email unset for a contact without one (SMS / WhatsApp)', () => {
    const s = signer()
    const out = SignerSchema.parse(
      transformSigner({ ...s, contact: { ...s.contact, email: null } }, COLLECTION_ID),
    )
    expect(out.email).toBeUndefined()
  })

  it('never carries the OTP code, seal images or attachment bytes in raw', () => {
    const raw = JSON.stringify(transformSigner(signer(), COLLECTION_ID).raw)
    expect(raw).not.toContain('482913')
    expect(raw).not.toContain('iVBORw0KGgo=')
    expect(raw).toContain('dana.levi@example.com')
  })

  it('throws on a signer without id', () => {
    expect(() => transformSigner(signer({ id: undefined }), COLLECTION_ID)).toThrow(/no id/)
  })
})
