import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSignaturitSignature,
} from '../../../../../../../src/verticals/docsign/adapters/signaturit/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { SIGNATURE_OBJECT_EXAMPLE, SIGNATURE_WITH_DATA_EXAMPLE } from './fixtures'

const ENV = '974e6f6c-2910-11e4-b3d4-0aa7697eb409'
const ITEM = '9781f42d-2910-11e4-b3d4-0aa7697eb409'

function withStatuses(...statuses: string[]): RawSignaturitSignature {
  return {
    ...SIGNATURE_OBJECT_EXAMPLE,
    documents: statuses.map((status, i) => ({
      ...SIGNATURE_OBJECT_EXAMPLE.documents[0]!,
      id: `item-${i}`,
      status,
    })),
  }
}

describe('signaturit transformEnvelope', () => {
  it('maps the documented Signature object example onto the canonical schema', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(SIGNATURE_OBJECT_EXAMPLE))
    expect(out.id).toBe(ENV)
    expect(out.externalId).toBe(ENV)
    expect(out.status).toBe('sent')
    expect(out.createdAt).toBe('2014-08-21T08:53:35.000Z')
    expect(out.signerIds).toEqual([`${ENV}:${ITEM}`])
    expect(out.documentIds).toEqual([`${ENV}:${ITEM}`])
    expect(out.signingOrder).toBe('sequential')
    expect(out.subject).toBe('')
    expect(out.senderEmail).toBeUndefined()
    expect(out.metadata).toEqual({})
    expect(out.platform).toBe('signaturit')
  })

  it('reads the documented data key/value pairs into metadata', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(SIGNATURE_WITH_DATA_EXAMPLE))
    expect(out.metadata).toEqual({ crm_id: '2455' })
  })

  it('carries decliner_email, which appears "only if a signer declines"', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope({ ...withStatuses('declined'), decliner_email: 'john@signaturit.com' }),
    )
    expect(out.status).toBe('declined')
    expect(out.metadata['declinerEmail']).toBe('john@signaturit.com')
  })

  it('derives the status from the documented document statuses', () => {
    expect(transformEnvelope(withStatuses('completed', 'completed')).status).toBe('completed')
    expect(transformEnvelope(withStatuses('completed', 'ready')).status).toBe('sent')
    // All in_queue: "being processed", not yet sent; the signers read 'created'.
    expect(transformEnvelope(withStatuses('in_queue')).status).toBe('unknown')
    expect(transformEnvelope(withStatuses('in_queue', 'in_queue')).status).toBe('unknown')
    expect(transformEnvelope(withStatuses('in_queue', 'ready')).status).toBe('sent')
    expect(transformEnvelope(withStatuses('signing')).status).toBe('sent')
    expect(transformEnvelope(withStatuses('ready', 'declined')).status).toBe('declined')
    expect(transformEnvelope(withStatuses('ready', 'canceled')).status).toBe('voided')
    expect(transformEnvelope(withStatuses('expired')).status).toBe('expired')
    expect(transformEnvelope(withStatuses('error')).status).toBe('unknown')
    expect(transformEnvelope(withStatuses('something_new')).status).toBe('unknown')
    expect(transformEnvelope(withStatuses()).status).toBe('unknown')
  })

  it('skips data values that are not scalars', () => {
    const out = transformEnvelope({
      ...SIGNATURE_OBJECT_EXAMPLE,
      data: [
        { key: 'crm_id', value: '2455' },
        { key: 'nested', value: { a: 1 } },
        { key: 'count', value: 3 },
      ],
    })
    expect(out.metadata).toEqual({ crm_id: '2455', count: '3' })
  })

  it('reports no createdAt for an unparseable date rather than passing it through', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope({ ...SIGNATURE_OBJECT_EXAMPLE, created_at: 'not a date' }),
    )
    expect(out.createdAt).toBeUndefined()
  })

  it('refuses a signature without its id', () => {
    const { id: _id, ...noId } = SIGNATURE_OBJECT_EXAMPLE
    expect(() => transformEnvelope(noId as unknown as RawSignaturitSignature)).toThrow(/id/)
  })
})
