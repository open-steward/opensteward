import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawAnnatureEnvelope,
} from '../../../../../../../src/verticals/docsign/adapters/annature/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { PAGED_ENVELOPE_EXAMPLE, RETRIEVE_ENVELOPE_EXAMPLE } from './fixtures'

const retrieved = RETRIEVE_ENVELOPE_EXAMPLE as RawAnnatureEnvelope
const paged = PAGED_ENVELOPE_EXAMPLE as RawAnnatureEnvelope

describe('annature transformEnvelope', () => {
  it('maps the documented Retrieve an envelope example onto the canonical schema', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(retrieved))
    expect(out.id).toBe('7e8f68e4c6df9395cd7ff48d69d7e2c1')
    expect(out.externalId).toBe('7e8f68e4c6df9395cd7ff48d69d7e2c1')
    expect(out.subject).toBe('Non disclosure agreement')
    expect(out.message).toBe('Lorem ipsum dolor sit amet.')
    expect(out.status).toBe('sent')
    expect(out.senderId).toBe('c64ce66b70b21c03bfd5dfa0ab14b730')
    expect(out.signerIds).toEqual(['255e591c2c9fe1bc99be1ec03075b402'])
    expect(out.signingOrder).toBe('parallel')
    expect(out.createdAt).toBe('2019-12-17T05:30:00.000Z')
    expect(out.sentAt).toBe('2019-12-17T05:30:00.000Z')
    expect(out.completedAt).toBeUndefined()
    expect(out.voidedAt).toBeUndefined()
    expect(out.platform).toBe('annature')
  })

  it('maps the documented paged-list element, with its completed timestamp', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(paged))
    expect(out.status).toBe('completed')
    expect(out.completedAt).toBe('2019-12-17T05:30:00.000Z')
  })

  it('drops the temporary download links from raw', () => {
    const out = transformEnvelope(retrieved)
    const raw = out.raw as Record<string, unknown>
    expect(raw).not.toHaveProperty('master')
    expect(raw).not.toHaveProperty('certificate')
    expect(raw).not.toHaveProperty('combined')
    expect(raw['id']).toBe(retrieved.id)
  })

  it('drops the documented `original` download link from raw too', () => {
    // The Envelope object documents `original` as a temporary download URL;
    // the examples omit it, so it is added here.
    const out = transformEnvelope({ ...retrieved, original: 'https://annature..' })
    expect(out.raw as Record<string, unknown>).not.toHaveProperty('original')
  })

  it.each([
    ['draft', 'draft'],
    ['created', 'draft'],
    ['sent', 'sent'],
    ['completed', 'completed'],
    ['voided', 'voided'],
    ['something-new', 'unknown'],
  ])('maps documented status %s to %s', (status, expected) => {
    const out = EnvelopeSchema.parse(transformEnvelope({ ...retrieved, status }))
    expect(out.status).toBe(expected)
  })

  it('reads the voided and declined timestamps', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope({
        ...retrieved,
        status: 'voided',
        voided: '2020-01-02T03:04:05Z',
        declined: '2020-01-01T00:00:00Z',
      }),
    )
    expect(out.voidedAt).toBe('2020-01-02T03:04:05.000Z')
    expect(out.declinedAt).toBe('2020-01-01T00:00:00.000Z')
  })

  it('is sequential when recipients carry different orders', () => {
    const r = retrieved.recipients[0]!
    const out = transformEnvelope({
      ...retrieved,
      recipients: [r, { ...r, id: 'second', order: 2 }],
    })
    expect(out.signingOrder).toBe('sequential')
    expect(out.signerIds).toEqual([r.id, 'second'])
  })

  it('refuses an envelope without its recipients array', () => {
    const { recipients: _r, ...rest } = retrieved
    expect(() => transformEnvelope(rest as RawAnnatureEnvelope)).toThrow(/recipients/)
  })
})
