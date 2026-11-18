import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/signaturit/transform/signer'
import type { RawSignaturitDocumentItem } from '../../../../../../../src/verticals/docsign/adapters/signaturit/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { SIGNATURE_OBJECT_EXAMPLE } from './fixtures'

const ENV = SIGNATURE_OBJECT_EXAMPLE.id
const ITEM: RawSignaturitDocumentItem = SIGNATURE_OBJECT_EXAMPLE.documents[0]!

describe('signaturit transformSigner', () => {
  it('maps a documented document item (one per signer and file) onto the canonical schema', () => {
    const out = SignerSchema.parse(transformSigner(ITEM, ENV))
    expect(out.id).toBe(`${ENV}:9781f42d-2910-11e4-b3d4-0aa7697eb409`)
    expect(out.externalId).toBe('9781f42d-2910-11e4-b3d4-0aa7697eb409')
    expect(out.envelopeId).toBe(ENV)
    expect(out.email).toBe('john@signaturit.com')
    expect(out.name).toBe('John')
    expect(out.role).toBe('signer')
    expect(out.status).toBe('sent')
    expect(out.signedAt).toBeUndefined()
    expect(out.routingOrder).toBeUndefined()
    expect(out.metadata).toEqual({ documentStatus: 'ready', fileName: 'document.pdf' })
    expect(out.platform).toBe('signaturit')
  })

  it('maps the documented document statuses', () => {
    const status = (s: string) => transformSigner({ ...ITEM, status: s }, ENV).status
    expect(status('in_queue')).toBe('created')
    expect(status('ready')).toBe('sent')
    expect(status('completed')).toBe('signed')
    expect(status('declined')).toBe('declined')
    expect(status('signing')).toBe('unknown')
    expect(status('expired')).toBe('unknown')
    expect(status('canceled')).toBe('unknown')
    expect(status('error')).toBe('unknown')
  })

  it('dates signing and declining from the documented document_signed / document_declined events', () => {
    const out = SignerSchema.parse(
      transformSigner(
        {
          ...ITEM,
          status: 'completed',
          events: [
            ...ITEM.events!,
            { created_at: '2014-08-22T10:00:00+0000', type: 'document_signed' },
          ],
        },
        ENV,
      ),
    )
    expect(out.signedAt).toBe('2014-08-22T10:00:00.000Z')
    const declined = SignerSchema.parse(
      transformSigner(
        {
          ...ITEM,
          status: 'declined',
          events: [{ created_at: '2014-08-23T10:00:00+0000', type: 'document_declined' }],
        },
        ENV,
      ),
    )
    expect(declined.declinedAt).toBe('2014-08-23T10:00:00.000Z')
  })

  it('refuses a document item without the signer name or id', () => {
    const { name: _n, ...noName } = ITEM
    const { id: _i, ...noId } = ITEM
    expect(() => transformSigner(noName as RawSignaturitDocumentItem, ENV)).toThrow(/name/)
    expect(() => transformSigner(noId as RawSignaturitDocumentItem, ENV)).toThrow(/id/)
  })
})
