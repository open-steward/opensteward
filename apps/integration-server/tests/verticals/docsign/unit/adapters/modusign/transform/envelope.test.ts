/**
 * transformEnvelope against `GetDocumentsResponseDocumentDto`
 * (https://developers.modusign.co.kr/reference/documentcontroller_getdocuments.md):
 * status enum DRAFT | SCHEDULED | ON_GOING | MODIFYING | APPROVAL_PENDING |
 * ON_PROCESSING | PROCESSING_FAILED | ABORTED | COMPLETED; abort.type
 * REJECTION | SIGNING_CANCELLATION | REQUEST_CANCELLATION.
 */
import { describe, it, expect } from 'vitest'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/modusign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { listedDocument, participant } from '../fixtures'

const ABORT = { message: '사유', abortedAt: '2020-01-03T00:00:00.000Z', participantId: null }

describe('modusign transformEnvelope', () => {
  it('maps a documented list row to a canonical Envelope', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(listedDocument(1)))
    expect(out).toMatchObject({
      id: 'doc_1',
      externalId: 'doc_1',
      status: 'sent',
      subject: '문서 1',
      senderEmail: 'requester@mail.com',
      senderName: '김요청',
      signingOrder: 'sequential',
      signerIds: ['p1', 'p2'],
      documentIds: ['doc_1'],
      createdAt: '2020-01-01T00:00:00.000Z',
      sentAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-02T00:00:00.000Z',
      platform: 'modusign',
      metadata: { 부서: '영업팀', modusignStatus: 'ON_GOING' },
    })
    expect(out.completedAt).toBeUndefined()
    expect(out.voidedAt).toBeUndefined()
  })

  it.each([
    ['DRAFT', 'draft'],
    ['SCHEDULED', 'draft'],
    ['ON_GOING', 'sent'],
    ['COMPLETED', 'completed'],
    ['MODIFYING', 'unknown'],
    ['APPROVAL_PENDING', 'unknown'],
    ['ON_PROCESSING', 'unknown'],
    ['PROCESSING_FAILED', 'unknown'],
    ['IN_PROGRESS', 'unknown'],
    ['CANCELLED', 'unknown'],
  ])('status %s → %s', (status, expected) => {
    expect(EnvelopeSchema.parse(transformEnvelope(listedDocument(1, { status }))).status).toBe(
      expected,
    )
  })

  it('ABORTED by REJECTION is declined at abort.abortedAt', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope(
        listedDocument(1, { status: 'ABORTED', abort: { ...ABORT, type: 'REJECTION' } }),
      ),
    )
    expect(out.status).toBe('declined')
    expect(out.declinedAt).toBe('2020-01-03T00:00:00.000Z')
    expect(out.voidedAt).toBeUndefined()
  })

  it.each(['SIGNING_CANCELLATION', 'REQUEST_CANCELLATION'])(
    'ABORTED by %s is voided at abort.abortedAt',
    (type) => {
      const out = EnvelopeSchema.parse(
        transformEnvelope(listedDocument(1, { status: 'ABORTED', abort: { ...ABORT, type } })),
      )
      expect(out.status).toBe('voided')
      expect(out.voidedAt).toBe('2020-01-03T00:00:00.000Z')
      expect(out.declinedAt).toBeUndefined()
    },
  )

  it('one signing order for everyone is parallel', () => {
    const doc = listedDocument(1, {
      participants: [participant(1, { signingOrder: 1 }), participant(2, { signingOrder: 1 })],
    })
    expect(EnvelopeSchema.parse(transformEnvelope(doc)).signingOrder).toBe('parallel')
  })

  it('a requester email that is not an address is omitted, not passed through', () => {
    const out = transformEnvelope(
      listedDocument(1, { requester: { email: 'not-an-email', name: '김요청' } }),
    )
    expect(EnvelopeSchema.parse(out).senderEmail).toBeUndefined()
  })

  it('never carries file/audit-trail download URLs or participant verification in raw', () => {
    const doc = listedDocument(1, {
      auditTrail: { downloadUrl: 'https://files.example/audit.pdf', locales: ['ko'] },
      participants: [
        participant(1, {
          verification: {
            mobileIdentification: {
              name: '박참여',
              phoneNumber: '01012345678',
              allowOptions: ['SMS_OR_PASS'],
            },
            password: { hint: '생일' },
          },
        }),
      ],
    })
    const out = EnvelopeSchema.parse(transformEnvelope(doc))
    const json = JSON.stringify(out)
    expect(json).not.toContain('downloadUrl')
    expect(json).not.toContain('01012345678')
    expect(json).not.toContain('생일')
    expect((out.raw as { participants: Array<{ id: string }> }).participants[0]!.id).toBe('p1')
  })

  it('throws on a row with no title instead of inventing a subject', () => {
    const doc = listedDocument(1)
    delete doc.title
    expect(() => transformEnvelope(doc)).toThrow(/title/)
  })
})
