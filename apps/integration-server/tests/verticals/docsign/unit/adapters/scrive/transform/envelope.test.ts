import { describe, it, expect } from 'vitest'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/scrive/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { documentExample } from '../fixtures'

describe('scrive transformEnvelope (documented Document example)', () => {
  it('parses with EnvelopeSchema and reads the documented fields', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(documentExample()))
    expect(out.id).toBe('8222115557375075439')
    expect(out.subject).toBe('Contract for Magnus')
    expect(out.status).toBe('completed')
    // The author party (is_author: true) is the sender; email and name come
    // from its "email" and "name" fields.
    expect(out.senderId).toBe('189255')
    expect(out.senderEmail).toBe('noreply@scrive.com')
    expect(out.senderName).toBe('Gregory Davids')
    expect(out.signerIds).toEqual(['189255', '189256'])
    // Both parties have sign_order 1.
    expect(out.signingOrder).toBe('parallel')
    // file, then sealed_file.
    expect(out.documentIds).toEqual(['195124', '195172'])
    expect(out.createdAt).toBe('2017-01-13T10:38:17.916Z')
    expect(out.updatedAt).toBe('2017-01-13T10:38:49.590Z')
    expect(out.expiresAt).toBe('2017-04-13T22:59:59.000Z')
    expect(out.platform).toBe('scrive')
  })

  it.each([
    ['preparation', 'draft'],
    ['pending', 'sent'],
    ['closed', 'completed'],
    ['canceled', 'voided'],
    ['rejected', 'declined'],
    ['timedout', 'expired'],
    ['awaiting_start', 'unknown'],
    ['document_error', 'unknown'],
  ])('maps the documented status %s to %s', (status, expected) => {
    const out = EnvelopeSchema.parse(transformEnvelope({ ...documentExample(), status }))
    expect(out.status).toBe(expected)
  })

  it('reads invitation_message as the message', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope({ ...documentExample(), invitation_message: 'Please sign' }),
    )
    expect(out.message).toBe('Please sign')
  })

  it('throws rather than inventing a subject when title is missing', () => {
    const { title: _title, ...doc } = documentExample()
    expect(() => transformEnvelope(doc)).toThrow(/title/)
  })

  it('is sequential when parties have different sign_order', () => {
    const doc = documentExample()
    doc.parties![1]!.sign_order = 2
    expect(EnvelopeSchema.parse(transformEnvelope(doc)).signingOrder).toBe('sequential')
  })

  it('takes the sender from is_author, not from is_signatory', () => {
    const doc = documentExample()
    // The signing party is the author; the viewer is not.
    doc.parties![0]!.is_author = false
    doc.parties![1]!.is_author = true
    const out = EnvelopeSchema.parse(transformEnvelope(doc))
    expect(out.senderId).toBe('189256')
    expect(out.senderName).toBe('Magnus Söderholm')
  })

  it('lists author attachment file ids after the main file', () => {
    const doc = {
      ...documentExample(),
      sealed_file: null,
      author_attachments: [
        { name: 'Terms', file_id: '36', required: false, add_to_sealed_file: true },
      ],
    }
    expect(EnvelopeSchema.parse(transformEnvelope(doc)).documentIds).toEqual(['195124', '36'])
  })
})
