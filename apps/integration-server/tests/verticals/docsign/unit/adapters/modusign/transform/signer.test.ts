import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/modusign/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { documentDetail, participant } from '../fixtures'

describe('modusign transformSigner', () => {
  it('maps a participant who appears in signings[] to a signed canonical Signer', () => {
    const doc = documentDetail()
    const out = SignerSchema.parse(transformSigner(doc.participants[0]!, doc))
    expect(out).toMatchObject({
      id: 'p1',
      externalId: 'p1',
      envelopeId: 'doc_1',
      email: 'participant1@mail.com',
      name: '참여자 1',
      role: 'signer',
      status: 'signed',
      routingOrder: 1,
      signedAt: '2020-01-01T00:00:00.000Z',
      platform: 'modusign',
    })
    expect(out.metadata).toEqual({ participantType: 'SIGNER', signingMethodType: 'EMAIL' })
  })

  it('the participant whose signingOrder is currentSigningOrder on an ON_GOING document is sent', () => {
    const doc = documentDetail()
    const out = SignerSchema.parse(transformSigner(doc.participants[1]!, doc))
    expect(out.status).toBe('sent')
    expect(out.signedAt).toBeUndefined()
  })

  it('a later signingOrder on an ON_GOING document has not been sent yet', () => {
    const doc = documentDetail({ participants: [participant(1), participant(2), participant(3)] })
    expect(SignerSchema.parse(transformSigner(doc.participants[2]!, doc)).status).toBe('created')
  })

  it('a DRAFT document leaves every unsigned participant created', () => {
    const doc = documentDetail({ status: 'DRAFT', signings: [], currentSigningOrder: 1 })
    expect(SignerSchema.parse(transformSigner(doc.participants[0]!, doc)).status).toBe('created')
  })

  it('an abort of type REJECTION by this participant is a decline with its reason and time', () => {
    const doc = documentDetail({
      status: 'ABORTED',
      abort: {
        type: 'REJECTION',
        message: '계약 조건 검토 필요',
        abortedAt: '2020-01-02T03:04:05.000Z',
        participantId: 'p2',
      },
    })
    const out = SignerSchema.parse(transformSigner(doc.participants[1]!, doc))
    expect(out.status).toBe('declined')
    expect(out.declinedAt).toBe('2020-01-02T03:04:05.000Z')
    expect(out.declineReason).toBe('계약 조건 검토 필요')
  })

  it('a REQUEST_CANCELLATION abort does not make a participant a decliner', () => {
    const doc = documentDetail({
      status: 'ABORTED',
      abort: {
        type: 'REQUEST_CANCELLATION',
        message: '요청 취소',
        abortedAt: '2020-01-02T03:04:05.000Z',
        participantId: null,
      },
    })
    const out = SignerSchema.parse(transformSigner(doc.participants[1]!, doc))
    expect(out.status).toBe('unknown')
    expect(out.declinedAt).toBeUndefined()
  })

  it('email comes only from an EMAIL signingMethod; a KAKAO phone number is omitted', () => {
    const p = participant(1, { signingMethod: { type: 'KAKAO', value: '01012345678' } })
    const doc = documentDetail({ participants: [p] })
    const out = SignerSchema.parse(transformSigner(p, doc))
    expect(out.email).toBeUndefined()
    expect(out.metadata['signingMethodType']).toBe('KAKAO')
  })

  it('a non-EMAIL signingMethod is never read as the email, whatever its value looks like', () => {
    const p = participant(1, {
      signingMethod: { type: 'SECURE_LINK', value: 'participant1@mail.com' },
    })
    const doc = documentDetail({ participants: [p] })
    expect(SignerSchema.parse(transformSigner(p, doc)).email).toBeUndefined()
  })

  it('a VIEWER participant has no canonical role and maps to unknown', () => {
    const p = participant(1, { type: 'VIEWER', manuallyViewing: false })
    const doc = documentDetail({ participants: [p] })
    expect(SignerSchema.parse(transformSigner(p, doc)).role).toBe('unknown')
  })

  it('a SIGNING_CANCELLATION abort names a participant but is not a decline', () => {
    const doc = documentDetail({
      status: 'ABORTED',
      abort: {
        type: 'SIGNING_CANCELLATION',
        message: '참여 취소',
        abortedAt: '2020-01-02T03:04:05.000Z',
        participantId: 'p2',
      },
    })
    const out = SignerSchema.parse(transformSigner(doc.participants[1]!, doc))
    expect(out.status).not.toBe('declined')
    expect(out.declinedAt).toBeUndefined()
    expect(out.declineReason).toBeUndefined()
  })

  it('a SCHEDULED document leaves every unsigned participant created', () => {
    const doc = documentDetail({ status: 'SCHEDULED', signings: [], currentSigningOrder: 1 })
    expect(SignerSchema.parse(transformSigner(doc.participants[0]!, doc)).status).toBe('created')
  })

  it('throws when the document has no signings[] rather than reading every signer as unsigned', () => {
    const doc = documentDetail()
    delete (doc as Partial<typeof doc>).signings
    expect(() => transformSigner(doc.participants[0]!, doc)).toThrow(/signings/)
  })

  it('never carries the participant verification (phone number, password hint) in raw', () => {
    const p = participant(1, {
      verification: {
        mobileIdentification: {
          name: '박참여',
          phoneNumber: '01012345678',
          allowOptions: ['SMS_OR_PASS'],
        },
        password: { hint: '생일' },
        dCert: { name: '모두싸인', bizNumber: '123-45-67890' },
      },
    })
    const doc = documentDetail({ participants: [p] })
    const out = SignerSchema.parse(transformSigner(p, doc))
    const json = JSON.stringify(out)
    expect(json).not.toContain('01012345678')
    expect(json).not.toContain('생일')
    expect(json).not.toContain('123-45-67890')
    expect((out.raw as { id: string }).id).toBe('p1')
  })
})
