import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSignRequestDocument,
  type RawSignRequestSigner,
} from '../../../../../../../src/verticals/docsign/adapters/signrequest/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

const signerA: RawSignRequestSigner = {
  uuid: 'sr-signer-alice',
  email: 'alice@example.com',
  display_name: 'Alice Doe',
  order: 0,
  needs_to_sign: true,
  signed: false,
  emailed: true,
}

const signerB: RawSignRequestSigner = {
  uuid: 'sr-signer-bob',
  email: 'bob@example.com',
  display_name: 'Bob Smith',
  order: 1,
  needs_to_sign: true,
  signed: false,
  emailed: false,
}

const rawDoc: RawSignRequestDocument = {
  uuid: 'doc-uuid-abc',
  name: 'NDA.pdf',
  status: 'se', // sent
  signrequest: {
    uuid: 'sr-uuid-abc',
    from_email: 'olivia@company.com',
    from_email_name: 'Olivia Admin',
    subject: 'Please sign the NDA',
    message: 'Kindly review and sign.',
    signers: [signerA, signerB],
    who: 'o',
  },
  created: '2024-01-15T10:00:00.000Z',
  user: { email: 'olivia@company.com', first_name: 'Olivia', last_name: 'Admin' },
  team: { name: 'Acme', subdomain: 'acme' },
  auto_expire_after: '2024-03-09T16:00:00.000Z',
  api_used: true,
  sandbox: false,
}

describe('signrequest transformEnvelope', () => {
  it('maps uuid to id and externalId', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.id).toBe('doc-uuid-abc')
    expect(result.externalId).toBe('doc-uuid-abc')
  })

  it('maps status se to sent', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.status).toBe('sent')
  })

  it('maps status si to completed', () => {
    const result = transformEnvelope({ ...rawDoc, status: 'si' })
    expect(result.status).toBe('completed')
  })

  it('maps status de to declined', () => {
    const result = transformEnvelope({ ...rawDoc, status: 'de' })
    expect(result.status).toBe('declined')
  })

  it('maps status ca to voided', () => {
    const result = transformEnvelope({ ...rawDoc, status: 'ca' })
    expect(result.status).toBe('voided')
  })

  it('maps status exp to expired', () => {
    const result = transformEnvelope({ ...rawDoc, status: 'exp' })
    expect(result.status).toBe('expired')
  })

  it('maps status ne to draft', () => {
    const result = transformEnvelope({ ...rawDoc, status: 'ne' })
    expect(result.status).toBe('draft')
  })

  it('maps signrequest.subject to subject', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.subject).toBe('Please sign the NDA')
  })

  it('falls back to document name for subject when signrequest.subject null', () => {
    const result = transformEnvelope({
      ...rawDoc,
      signrequest: { ...rawDoc.signrequest!, subject: null },
    })
    expect(result.subject).toBe('NDA.pdf')
  })

  it('maps signrequest.message', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.message).toBe('Kindly review and sign.')
  })

  it('maps from_email to senderEmail', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.senderEmail).toBe('olivia@company.com')
  })

  it('maps from_email_name to senderName', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.senderName).toBe('Olivia Admin')
  })

  it('detects sequential signing when signers have different orders', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.signingOrder).toBe('sequential')
  })

  it('detects parallel signing when signers share the same order', () => {
    const result = transformEnvelope({
      ...rawDoc,
      signrequest: {
        ...rawDoc.signrequest!,
        signers: [
          { ...signerA, order: 0 },
          { ...signerB, order: 0 },
        ],
      },
    })
    expect(result.signingOrder).toBe('parallel')
  })

  it('maps signerIds ordered by signer order', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.signerIds).toEqual(['sr-signer-alice', 'sr-signer-bob'])
  })

  it('sets documentIds to [uuid]', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.documentIds).toEqual(['doc-uuid-abc'])
  })

  it('maps created to createdAt ISO', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('maps auto_expire_after to expiresAt', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.expiresAt).toBe('2024-03-09T16:00:00.000Z')
  })

  it('sets completedAt once all required signers have signed', () => {
    const signed = new Date('2024-02-01T14:20:00.000Z').toISOString()
    const result = transformEnvelope({
      ...rawDoc,
      status: 'si',
      signrequest: {
        ...rawDoc.signrequest!,
        signers: [
          { ...signerA, signed: true, signed_on: signed },
          { ...signerB, signed: true, signed_on: signed },
        ],
      },
    })
    expect(result.completedAt).toBe(signed)
  })

  it('leaves completedAt undefined when not all required signers signed', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.completedAt).toBeUndefined()
  })

  it('sets declinedAt from first declined signer', () => {
    const declined = '2024-01-20T09:00:00.000Z'
    const result = transformEnvelope({
      ...rawDoc,
      status: 'de',
      signrequest: {
        ...rawDoc.signrequest!,
        signers: [{ ...signerA, declined: true, declined_on: declined }],
      },
    })
    expect(result.declinedAt).toBe(declined)
  })

  it('sets platform to signrequest', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.platform).toBe('signrequest')
  })

  it('puts who, team subdomain, and sandbox into metadata', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.metadata.who).toBe('o')
    expect(result.metadata.team).toBe('acme')
    expect(result.metadata.sandbox).toBe('false')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(rawDoc)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
