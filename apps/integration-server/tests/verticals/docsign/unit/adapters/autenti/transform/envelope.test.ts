import { describe, it, expect } from 'vitest'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/autenti/transform/envelope'
import { documentProcessInProgress } from '../fixtures'

describe('Autenti transformEnvelope (DocumentProcess)', () => {
  it('maps the documented DocumentProcessInProgress example', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(documentProcessInProgress()))
    expect(out.id).toBe('DOCUMENT_PROCESS:ac842283-afd4-4e26-9873-2bf35bd89b42')
    expect(out.externalId).toBe(out.id)
    expect(out.status).toBe('sent')
    expect(out.subject).toBe('Sailing boat rental agreement')
    expect(out.message).toBe('Please review the terms and sign')
    expect(out.senderId).toBe('PARTY-PUBLIC_SIGNING_PROCESS_ID:4060e833')
    expect(out.senderEmail).toBe('john.smith@acme.com')
    expect(out.senderName).toBe('John Smith')
    expect(out.signingOrder).toBe('sequential')
    expect(out.signerIds).toEqual([
      'PARTY-PUBLIC_APPROVAL_PROCESS_ID:4060e833',
      'PARTY-PUBLIC_SIGNING_PROCESS_ID:4060e833',
      'PARTY-PUBLIC_SIGNING_PROCESS_ID:bdb551b2',
    ])
    expect(out.documentIds).toEqual([
      'FILE-SOURCE_FILE:3cf4307e-63cc-4be9-b616-bd2b99d9778e',
      'FILE-DTBS:ac842283-afd4-4e26-9873-2bf35bd89b42/DTBS',
    ])
    expect(out.createdAt).toBe('2020-06-18T19:16:40.997Z')
    expect(out.updatedAt).toBe('2020-10-21T15:48:34.863Z')
    expect(out.metadata).toEqual({ status: 'PROCESSING', processLanguage: 'en' })
    expect(out.platform).toBe('autenti')
  })

  it.each([
    ['DRAFT', 'draft'],
    ['PROCESSING', 'sent'],
    ['COMPLETED', 'completed'],
    ['REJECTED', 'declined'],
    ['WITHDRAWN', 'voided'],
    ['ERROR', 'unknown'],
    ['UNKNOWN_DOCUMENT_STATUS', 'unknown'],
  ])('maps DocumentProcessStatus %s to %s', (status, expected) => {
    const out = EnvelopeSchema.parse(transformEnvelope({ ...documentProcessInProgress(), status }))
    expect(out.status).toBe(expected)
  })

  it('a list item without parties or files (list rows carry no files) is parallel with no ids', () => {
    const { parties: _p, files: _f, ...bare } = documentProcessInProgress()
    const out = EnvelopeSchema.parse(transformEnvelope(bare))
    expect(out.signingOrder).toBe('parallel')
    expect(out.signerIds).toEqual([])
    expect(out.documentIds).toEqual([])
    expect(out.senderEmail).toBeUndefined()
  })

  it('is parallel when every participant shares one participation priority', () => {
    // The documented example's parties, with the third participant (priority 3)
    // left out and the second one's priority 2 constraint kept only on it.
    const doc = documentProcessInProgress()
    const [approver, signer, , sender] = doc.parties
    const onePriority = {
      ...doc,
      parties: [approver!, { ...signer!, constraints: approver!.constraints }, sender!],
    }
    const out = EnvelopeSchema.parse(transformEnvelope(onePriority))
    expect(out.signerIds).toHaveLength(2)
    expect(out.signingOrder).toBe('parallel')
  })

  it('throws rather than inventing an id or a subject', () => {
    const { id: _id, ...noId } = documentProcessInProgress()
    expect(() => transformEnvelope(noId)).toThrow(/no id/)
    const { title: _t, ...noTitle } = documentProcessInProgress()
    expect(() => transformEnvelope(noTitle)).toThrow(/no title/)
  })
})
