import { describe, it, expect } from 'vitest'
import { transformAuditTrailEntry } from '../../../../../../../src/verticals/docsign/adapters/signaturit/transform/audit-trail-entry'
import type { RawSignaturitDocumentItem } from '../../../../../../../src/verticals/docsign/adapters/signaturit/transform/envelope'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { SIGNATURE_OBJECT_EXAMPLE } from './fixtures'

const ENV = SIGNATURE_OBJECT_EXAMPLE.id
const ITEM: RawSignaturitDocumentItem = SIGNATURE_OBJECT_EXAMPLE.documents[0]!
const ITEM_ID = '9781f42d-2910-11e4-b3d4-0aa7697eb409'

describe('signaturit transformAuditTrailEntry', () => {
  it('maps a documented document event onto the canonical schema', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry(ITEM.events![0]!, ITEM, ENV, 0),
    )
    expect(out.id).toBe(`${ENV}:${ITEM_ID}:0`)
    expect(out.externalId).toBe(`${ENV}:${ITEM_ID}:0`)
    expect(out.envelopeId).toBe(ENV)
    expect(out.occurredAt).toBe('2014-08-21T08:55:14.000Z')
    expect(out.eventType).toBe('sent')
    expect(out.description).toBe('email_processed')
    // An email being processed is a system event, not the signer acting.
    expect(out.actorEmail).toBeUndefined()
    expect(out.actorId).toBeUndefined()
    expect(out.actorName).toBeUndefined()
    expect(out.metadata).toEqual({ documentId: ITEM_ID })
    expect(out.platform).toBe('signaturit')
  })

  it('names the signer as actor on the events the docs describe as the signer acting', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry(
        { created_at: '2014-08-22T10:00:00+0000', type: 'document_signed' },
        ITEM,
        ENV,
        3,
      ),
    )
    expect(out.eventType).toBe('signed')
    expect(out.actorId).toBe(`${ENV}:${ITEM_ID}`)
    expect(out.actorEmail).toBe('john@signaturit.com')
    expect(out.actorName).toBe('John')
  })

  it('maps every documented event type', () => {
    const type = (t: string) =>
      transformAuditTrailEntry({ created_at: '2014-08-21T08:55:14+0000', type: t }, ITEM, ENV, 0)
        .eventType
    expect(type('email_processed')).toBe('sent')
    expect(type('sms_processed')).toBe('sent')
    expect(type('email_delivered')).toBe('other')
    expect(type('sms_delivered')).toBe('other')
    expect(type('email_bounced')).toBe('delivery_failed')
    expect(type('email_deferred')).toBe('other')
    expect(type('reminder_email_processed')).toBe('auto_reminded')
    expect(type('reminder_email_delivered')).toBe('other')
    expect(type('document_opened')).toBe('viewed')
    expect(type('document_signed')).toBe('signed')
    expect(type('document_completed')).toBe('completed')
    expect(type('audit_trail_completed')).toBe('other')
    expect(type('document_declined')).toBe('declined')
    expect(type('document_expired')).toBe('expired')
    expect(type('document_canceled')).toBe('voided')
    expect(type('photo_added')).toBe('other')
    expect(type('voice_added')).toBe('other')
    expect(type('file_added')).toBe('other')
    expect(type('photo_id_added')).toBe('other')
    expect(type('expiration_extended')).toBe('other')
    expect(type('not_documented')).toBe('unknown')
  })

  it('refuses an event without its documented type', () => {
    expect(() =>
      transformAuditTrailEntry({ created_at: '2014-08-21T08:55:14+0000' }, ITEM, ENV, 0),
    ).toThrow(/type/)
  })

  it('refuses an event without a parseable created_at rather than inventing a time', () => {
    expect(() => transformAuditTrailEntry({ type: 'email_processed' }, ITEM, ENV, 0)).toThrow(
      /created_at/,
    )
  })
})
