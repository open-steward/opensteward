import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawEversignAuditLogEntry,
} from '../../../../../../../src/verticals/docsign/adapters/eversign/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

/**
 * Fixture is the documented Audit Log example response
 * (https://eversign.com/api/documentation/methods, "Audit Log"). The docs page
 * obfuscates the example email as "[email protected]"; a stand-in address is
 * used in its place. Every other value is copied verbatim.
 */
const DOCUMENTED: RawEversignAuditLogEntry = {
  entry_id: 202201,
  event_type: 'document_viewed',
  event_assoc_signer: '1',
  event_assoc_signer_name: 'John Doe',
  event_assoc_signer_email: 'john.doe@example.com',
  event_assoc_signer_additional_data: {
    signer_authentication_sms_enabled: 1,
    signer_authentication_phone_number: '+15550000000',
  },
  time_stamp: '1642604310',
  document_checksum: '1f1beb5b97c283ff1f7c3d9500aed8de',
  combined_checksum: '6730698649a3e4e300948bc57f7a94f4',
  client_ip: '127.0.0.1',
  signer_ip: '',
  merged_document_file_checksum: '',
}

describe('eversign transformAuditTrailEntry', () => {
  it('maps the documented Audit Log example to a canonical AuditTrailEntry', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(DOCUMENTED, 'docHash1'))
    expect(out.id).toBe('docHash1:202201')
    expect(out.externalId).toBe('202201')
    expect(out.envelopeId).toBe('docHash1')
    expect(out.occurredAt).toBe(new Date(1642604310 * 1000).toISOString())
    expect(out.eventType).toBe('viewed')
    expect(out.description).toBe('Document has been opened/viewed')
    expect(out.actorId).toBe('1')
    expect(out.actorName).toBe('John Doe')
    expect(out.actorEmail).toBe('john.doe@example.com')
    expect(out.actorIp).toBe('127.0.0.1')
    expect(out.platform).toBe('eversign')
    expect(out.metadata).toEqual({
      event_type: 'document_viewed',
      document_checksum: '1f1beb5b97c283ff1f7c3d9500aed8de',
      combined_checksum: '6730698649a3e4e300948bc57f7a94f4',
    })
    expect(out.raw).toBe(DOCUMENTED)
  })

  it.each([
    ['document_created', 'created'],
    ['document_sent', 'sent'],
    ['document_viewed', 'viewed'],
    ['document_signed', 'signed'],
    ['document_declined', 'declined'],
    ['document_completed', 'completed'],
    ['document_cancelled', 'voided'],
    ['document_expired', 'expired'],
    ['signer_bounced', 'delivery_failed'],
    ['document_trashed', 'other'],
    ['document_forwarded', 'other'],
  ] as const)('maps documented event %s to %s', (eventType, canonical) => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry({ ...DOCUMENTED, event_type: eventType }, 'h'),
    )
    expect(out.eventType).toBe(canonical)
  })

  it('omits empty signer fields for a system event instead of inventing an actor', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry(
        {
          entry_id: 7,
          event_type: 'document_created',
          event_assoc_signer: '',
          event_assoc_signer_name: '',
          event_assoc_signer_email: '',
          time_stamp: '1642604000',
          client_ip: '',
          signer_ip: '',
        },
        'h',
      ),
    )
    expect(out.actorId).toBeUndefined()
    expect(out.actorName).toBeUndefined()
    expect(out.actorEmail).toBeUndefined()
    expect(out.actorIp).toBeUndefined()
    expect(out.description).toBe('Document has been created')
  })

  it('keeps an undocumented event name as its own description', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry({ ...DOCUMENTED, event_type: 'signer_2fa_enabled' }, 'h'),
    )
    expect(out.eventType).toBe('other')
    expect(out.description).toBe('signer_2fa_enabled')
  })

  it('throws rather than inventing an id or a time when the documented fields are missing', () => {
    const { entry_id: _id, ...noId } = DOCUMENTED
    expect(() => transformAuditTrailEntry(noId, 'h')).toThrow(/entry_id/)
    const { time_stamp: _ts, ...noTs } = DOCUMENTED
    expect(() => transformAuditTrailEntry(noTs, 'h')).toThrow(/time_stamp/)
  })

  it('keeps non-empty signer_ip and merged_document_file_checksum in metadata', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry(
        {
          ...DOCUMENTED,
          event_type: 'document_signed',
          signer_ip: '10.0.0.9',
          merged_document_file_checksum: 'abc123',
        },
        'h',
      ),
    )
    expect(out.metadata).toEqual({
      event_type: 'document_signed',
      document_checksum: '1f1beb5b97c283ff1f7c3d9500aed8de',
      combined_checksum: '6730698649a3e4e300948bc57f7a94f4',
      signer_ip: '10.0.0.9',
      merged_document_file_checksum: 'abc123',
    })
    expect(out.actorIp).toBe('127.0.0.1')
  })

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'does not resolve the prototype key %s as an event mapping',
    (eventType) => {
      const out = AuditTrailEntrySchema.parse(
        transformAuditTrailEntry({ ...DOCUMENTED, event_type: eventType }, 'h'),
      )
      expect(out.eventType).toBe('other')
      expect(out.description).toBe(eventType)
    },
  )
})
