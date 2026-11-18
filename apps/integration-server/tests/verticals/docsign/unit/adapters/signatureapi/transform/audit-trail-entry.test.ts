/**
 * SignatureAPI envelope event → canonical AuditTrailEntry.
 *
 * Fixtures follow the first-party OpenAPI spec
 * (https://spec.signatureapi.com/openapi.yaml). `Event.EventBase` requires
 * `id` ("Uses the `evt_` prefix.") and `timestamp` ("When the event occurred,
 * in ISO 8601 format."); `Event.RecipientEventData` carries `envelope_id`,
 * `object_type`, `object_id`, `envelope_metadata`, `recipient_type` and
 * `recipient_key`; `recipient.accessed` adds `ip`, `user_agent`, `session_id`.
 * RECIPIENT_ACCESSED is the spec's own `recipient.accessed` example.
 */
import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawSignatureapiEvent,
} from '../../../../../../../src/verticals/docsign/adapters/signatureapi/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

const ENV = '5e5ace5e-bd1e-4d5a-bb1f-6a2b2e42cd13'

const RECIPIENT_ACCESSED: RawSignatureapiEvent = {
  id: 'evt_yA80uuM4c90EbmxFuOC8Xv5',
  type: 'recipient.accessed',
  timestamp: '2022-01-01T00:00:00Z',
  data: {
    envelope_id: ENV,
    object_type: 'recipient',
    object_id: 're_7vWMHIEuIIit8IRuKgtb61',
    recipient_type: 'signer',
    recipient_key: 'tenant',
    ip: '123.122.990.22',
    user_agent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    session_id: 'ses_2X6eHBCL84MDGrLQX0mHI72',
    envelope_metadata: { IntegrationId: '123456', IntegrationName: 'My Integration' },
  },
}

const ENVELOPE_COMPLETED: RawSignatureapiEvent = {
  id: 'evt_1sAAaVfabdt0esVjmSTmLA',
  type: 'envelope.completed',
  timestamp: '2025-07-15T14:30:00Z',
  data: {
    envelope_id: ENV,
    object_type: 'envelope',
    object_id: ENV,
    envelope_metadata: {},
  },
}

describe('signatureapi transformAuditTrailEntry', () => {
  it('maps the documented recipient.accessed example', () => {
    const result = AuditTrailEntrySchema.parse(transformAuditTrailEntry(RECIPIENT_ACCESSED, ENV))
    expect(result.id).toBe('evt_yA80uuM4c90EbmxFuOC8Xv5')
    expect(result.externalId).toBe('evt_yA80uuM4c90EbmxFuOC8Xv5')
    expect(result.envelopeId).toBe(ENV)
    expect(result.occurredAt).toBe('2022-01-01T00:00:00.000Z')
    expect(result.eventType).toBe('viewed')
    expect(result.description).toBe('recipient.accessed')
    expect(result.actorId).toBe('re_7vWMHIEuIIit8IRuKgtb61')
    expect(result.actorIp).toBe('123.122.990.22')
    expect(result.actorEmail).toBeUndefined()
    expect(result.actorName).toBeUndefined()
    expect(result.platform).toBe('signatureapi')
    expect(result.metadata).toEqual({
      type: 'recipient.accessed',
      object_type: 'recipient',
      object_id: 're_7vWMHIEuIIit8IRuKgtb61',
      recipient_type: 'signer',
      recipient_key: 'tenant',
      session_id: 'ses_2X6eHBCL84MDGrLQX0mHI72',
    })
  })

  it('an envelope event has no actor', () => {
    const result = AuditTrailEntrySchema.parse(transformAuditTrailEntry(ENVELOPE_COMPLETED, ENV))
    expect(result.eventType).toBe('completed')
    expect(result.actorId).toBeUndefined()
    expect(result.actorIp).toBeUndefined()
    expect(result.metadata).toEqual({
      type: 'envelope.completed',
      object_type: 'envelope',
      object_id: ENV,
    })
  })

  it('maps every documented Event.TypeForEnvelope value', () => {
    const check = (type: string) =>
      AuditTrailEntrySchema.parse(transformAuditTrailEntry({ ...ENVELOPE_COMPLETED, type }, ENV))
        .eventType

    expect(check('envelope.created')).toBe('created')
    expect(check('envelope.started')).toBe('sent')
    expect(check('envelope.completed')).toBe('completed')
    expect(check('envelope.failed')).toBe('other')
    expect(check('envelope.canceled')).toBe('voided')
    expect(check('recipient.released')).toBe('sent')
    expect(check('recipient.sent')).toBe('sent')
    expect(check('recipient.accessed')).toBe('viewed')
    expect(check('recipient.identity_verification_started')).toBe('other')
    expect(check('recipient.identity_verified')).toBe('authenticated')
    expect(check('recipient.identity_rejected')).toBe('other')
    expect(check('recipient.viewed')).toBe('viewed')
    expect(check('recipient.completed')).toBe('signed')
    expect(check('recipient.soft_bounced')).toBe('delivery_failed')
    expect(check('recipient.hard_bounced')).toBe('delivery_failed')
    expect(check('recipient.rejected')).toBe('declined')
    expect(check('recipient.failed')).toBe('delivery_failed')
    expect(check('recipient.replaced')).toBe('reassigned')
    expect(check('recipient.resent')).toBe('sent')
    expect(check('deliverable.generated')).toBe('completed')
    expect(check('deliverable.failed')).toBe('other')
    expect(check('something.else')).toBe('other')
  })

  it('throws rather than inventing a time when the required timestamp is absent', () => {
    const { timestamp: _t, ...noTs } = ENVELOPE_COMPLETED
    expect(() => transformAuditTrailEntry(noTs as RawSignatureapiEvent, ENV)).toThrow(/timestamp/)
  })

  it('does not read an undocumented created_at as the event time', () => {
    const { timestamp: _t, ...noTs } = ENVELOPE_COMPLETED
    const raw = { ...noTs, created_at: '2026-01-10T09:00:00Z' } as unknown as RawSignatureapiEvent
    expect(() => transformAuditTrailEntry(raw, ENV)).toThrow(/timestamp/)
  })
})
