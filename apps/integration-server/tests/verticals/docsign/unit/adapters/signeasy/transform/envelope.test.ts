/**
 * SignEasy envelope transform, fed the documented example responses of
 * GET /rs/envelope/, GET /rs/envelope/{pending_file_id} and
 * GET /rs/envelope/signed/ (see ../signeasy.fixture.ts for the doc URLs).
 */
import { describe, it, expect } from 'vitest'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/signeasy/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import {
  FETCH_ENVELOPE_EXAMPLE,
  LIST_ENVELOPES_EXAMPLE,
  LIST_SIGNED_ENVELOPES_EXAMPLE,
} from '../signeasy.fixture'

const iso = (seconds: number) => new Date(seconds * 1000).toISOString()

describe('signeasy transformEnvelope', () => {
  it('maps a documented GET /rs/envelope/ list item', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(LIST_ENVELOPES_EXAMPLE.files[0]!, 'name'))
    expect(out.id).toBe('240300')
    expect(out.externalId).toBe('240300')
    expect(out.status).toBe('sent')
    expect(out.subject).toBe('Employment Agreement - Prashanth.pdf')
    expect(out.senderId).toBe('3625900')
    expect(out.senderEmail).toBe('acme@example.com')
    expect(out.senderName).toBe('Will Coyote')
    expect(out.signingOrder).toBe('parallel')
    expect(out.signerIds).toEqual(['384831', '384832'])
    expect(out.documentIds).toEqual([])
    expect(out.createdAt).toBe(iso(1574307538))
    expect(out.updatedAt).toBe(iso(1574307655))
    expect(out.platform).toBe('signeasy')
  })

  it('maps the documented GET /rs/envelope/{pending_file_id} detail', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(FETCH_ENVELOPE_EXAMPLE, 'subject'))
    expect(out.id).toBe('200000001')
    expect(out.status).toBe('sent')
    expect(out.message).toBe('This is a test request.')
    expect(out.senderName).toBe('User')
    expect(out.signingOrder).toBe('sequential')
    expect(out.signerIds).toEqual(['300000001', '300000002', '300000003', '300000004'])
    expect(out.documentIds).toEqual(['400001', '400002'])
    expect(out.expiresAt).toBe(iso(1815053834))
    expect(out.metadata).toEqual({ key1: 'value1', key2: 'value2' })
  })

  it('maps the pending_file of a documented GET /rs/envelope/signed/ item', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope(LIST_SIGNED_ENVELOPES_EXAMPLE.files[0]!.pending_file, 'name'),
    )
    expect(out.id).toBe('1000192')
    expect(out.status).toBe('completed')
  })

  it.each([
    ['complete', 'completed'],
    ['incomplete', 'sent'],
    ['canceled', 'voided'],
    ['recipient_declined', 'declined'],
    ['expired', 'expired'],
    ['something_new', 'unknown'],
  ])('maps documented status %s to %s', (status, expected) => {
    const out = EnvelopeSchema.parse(
      transformEnvelope({ ...FETCH_ENVELOPE_EXAMPLE, status }, 'subject'),
    )
    expect(out.status).toBe(expected)
  })

  it('throws on an envelope without an id rather than inventing one', () => {
    expect(() =>
      transformEnvelope({ ...FETCH_ENVELOPE_EXAMPLE, id: undefined }, 'subject'),
    ).toThrow(/id/)
  })

  it('throws on a recipient without recipient_id instead of listing a synthetic signer id', () => {
    const recipients = [{ ...FETCH_ENVELOPE_EXAMPLE.recipients[0]!, recipient_id: undefined }]
    expect(() => transformEnvelope({ ...FETCH_ENVELOPE_EXAMPLE, recipients }, 'subject')).toThrow(
      /recipient carries no id/,
    )
  })

  it('throws on a source without an id instead of listing a synthetic document id', () => {
    const sources = [{ ...FETCH_ENVELOPE_EXAMPLE.sources[0]!, id: undefined }]
    expect(() => transformEnvelope({ ...FETCH_ENVELOPE_EXAMPLE, sources }, 'subject')).toThrow(
      /source carries no id/,
    )
  })

  it('leaves senderName unset when both owner names are empty', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope(
        { ...FETCH_ENVELOPE_EXAMPLE, owner_first_name: '', owner_last_name: '' },
        'subject',
      ),
    )
    expect(out.senderName).toBeUndefined()
  })

  it('throws on a list item without its documented name instead of serving an empty subject', () => {
    expect(() =>
      transformEnvelope({ ...LIST_ENVELOPES_EXAMPLE.files[0]!, name: undefined }, 'name'),
    ).toThrow(/envelope name/)
  })

  it('reads the detail subject from its documented `subject` field, not a list `name`', () => {
    expect(transformEnvelope(FETCH_ENVELOPE_EXAMPLE, 'subject').subject).toBe('')
    expect(
      transformEnvelope({ ...FETCH_ENVELOPE_EXAMPLE, subject: 'Offer letter' }, 'subject').subject,
    ).toBe('Offer letter')
  })

  it('throws on a detail without its documented subject field', () => {
    expect(() =>
      transformEnvelope({ ...FETCH_ENVELOPE_EXAMPLE, subject: undefined }, 'subject'),
    ).toThrow(/envelope subject/)
  })

  it.each([[undefined], [2], [true]])(
    'throws on is_ordered %s, which is not the documented 0 or 1',
    (isOrdered) => {
      expect(() =>
        transformEnvelope({ ...FETCH_ENVELOPE_EXAMPLE, is_ordered: isOrdered as never }, 'subject'),
      ).toThrow(/is_ordered/)
    },
  )

  it('maps is_ordered 0 to parallel and 1 to sequential', () => {
    expect(
      transformEnvelope({ ...FETCH_ENVELOPE_EXAMPLE, is_ordered: 0 }, 'subject').signingOrder,
    ).toBe('parallel')
    expect(
      transformEnvelope({ ...FETCH_ENVELOPE_EXAMPLE, is_ordered: 1 }, 'subject').signingOrder,
    ).toBe('sequential')
  })
})
