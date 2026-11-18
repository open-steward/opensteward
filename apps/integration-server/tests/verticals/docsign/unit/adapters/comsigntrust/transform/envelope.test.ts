import { describe, it, expect } from 'vitest'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/comsigntrust/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import {
  collection,
  COLLECTION_ID,
  DOC_ID_1,
  DOC_ID_2,
  SIGNER_ID_1,
  SIGNER_ID_2,
} from '../fixtures/wesign'

describe('comsigntrust/transform/envelope (DocumentCollectionResposneDTO)', () => {
  it('parses against the canonical EnvelopeSchema', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(collection()))
    expect(out.id).toBe(COLLECTION_ID)
    expect(out.externalId).toBe(COLLECTION_ID)
    expect(out.platform).toBe('comsigntrust')
  })

  it('reads name, sender user and creation time', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(collection()))
    expect(out.subject).toBe('Lease agreement')
    expect(out.senderId).toBe('7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d')
    expect(out.senderEmail).toBe('avi.sender@example.com')
    expect(out.senderName).toBe('Avi Sender')
    // zone-less timestamps are UTC, as WeSign's own client reads them
    expect(out.createdAt).toBe('2026-03-01T07:59:00.000Z')
  })

  it('builds signer and document ids scoped to the collection', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(collection()))
    expect(out.signerIds).toEqual([
      `${COLLECTION_ID}:${SIGNER_ID_1}`,
      `${COLLECTION_ID}:${SIGNER_ID_2}`,
    ])
    expect(out.documentIds).toEqual([
      `${COLLECTION_ID}:${DOC_ID_1}`,
      `${COLLECTION_ID}:${DOC_ID_2}`,
    ])
  })

  it.each([
    [0, 'draft'],
    [1, 'draft'],
    [2, 'sent'],
    [3, 'delivered'],
    [4, 'completed'],
    [5, 'declined'],
    [6, 'unknown'],
    [7, 'unknown'],
    [8, 'voided'],
    [9, 'completed'],
  ] as const)('maps documentStatus %i → %s', (documentStatus, status) => {
    expect(EnvelopeSchema.parse(transformEnvelope(collection({ documentStatus }))).status).toBe(
      status,
    )
  })

  it('sets completedAt from signedTime only on a signed collection', () => {
    expect(EnvelopeSchema.parse(transformEnvelope(collection())).completedAt).toBe(
      '2026-03-01T10:00:00.000Z',
    )
    expect(
      EnvelopeSchema.parse(transformEnvelope(collection({ documentStatus: 2 }))).completedAt,
    ).toBeUndefined()
  })

  it('reads a zone-less timestamp as UTC even when the host is not on UTC', () => {
    const tz = process.env.TZ
    process.env.TZ = 'Asia/Jerusalem'
    try {
      expect(new Date('2026-03-01T07:59:00').toISOString()).not.toBe('2026-03-01T07:59:00.000Z')
      expect(transformEnvelope(collection()).createdAt).toBe('2026-03-01T07:59:00.000Z')
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })

  it('drops the year-1 placeholder WeSign sends for an unset date', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope(collection({ signedTime: '0001-01-01T00:00:00' })),
    )
    expect(out.completedAt).toBeUndefined()
  })

  // "Mode: OrderedGroupSign = 1, GroupSign = 2, Online = 3, PublicTemplateLink = 4, SelfSign = 100"
  it.each([
    [1, 'sequential'],
    [2, 'parallel'],
    [3, 'parallel'],
    [4, 'parallel'],
    [100, 'parallel'],
  ] as const)('maps mode %i → %s signing order', (mode, signingOrder) => {
    expect(EnvelopeSchema.parse(transformEnvelope(collection({ mode }))).signingOrder).toBe(
      signingOrder,
    )
  })

  it('carries documentStatus, mode and distributionId in metadata', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope(
        collection({
          documentStatus: 6,
          mode: 3,
          distributionId: '11111111-2222-4333-8444-555555555555',
        }),
      ),
    )
    expect(out.metadata).toEqual({
      documentStatus: '6',
      mode: '3',
      distributionId: '11111111-2222-4333-8444-555555555555',
    })
  })

  it('keeps OTP codes, seals and signer attachments out of raw', () => {
    const raw = JSON.stringify(transformEnvelope(collection()).raw)
    expect(raw).not.toContain('482913')
    expect(raw).not.toContain('base64')
    expect(raw).not.toContain('companySigner1Details')
  })

  it('throws on a collection without documentCollectionId', () => {
    expect(() => transformEnvelope(collection({ documentCollectionId: undefined }))).toThrow(
      /documentCollectionId/,
    )
  })
})
