/**
 * GetAccept `GET /documents/{documentId}/log` row → canonical AuditTrailEntry.
 *
 * The fixture uses only the properties the `LogEntry` schema ("Detailed log
 * entry") declares in https://raw.githubusercontent.com/getaccept/openapi/HEAD/openapi.json:
 * created_at, document_id, email, event_meta_data, event_name, first_name,
 * geo_city, geo_country_name, geo_ip, last_name. The spec gives no example
 * values and no vocabulary for `event_name`, so the values here are
 * placeholders of the declared types.
 */
import { describe, it, expect } from 'vitest'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import {
  transformAuditTrailEntry,
  type RawGetAcceptLogEntry,
} from '../../../../../../../src/verticals/docsign/adapters/getaccept/transform/audit-trail-entry'

const ROW: RawGetAcceptLogEntry = {
  created_at: '2026-02-01T14:20:00Z',
  document_id: 'doc-1',
  email: 'jane.doe@acme.example',
  event_meta_data: 'meta',
  event_name: 'Document signed',
  first_name: 'Jane',
  geo_city: 'Stockholm',
  geo_country_name: 'Sweden',
  geo_ip: '203.0.113.10',
  last_name: 'Doe',
}

describe('GetAccept transformAuditTrailEntry (LogEntry)', () => {
  it('maps the documented LogEntry fields and parses as AuditTrailEntry', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(ROW, 'doc-1', 3))
    expect(out.id).toBe('doc-1:3')
    expect(out.externalId).toBe('doc-1:3')
    expect(out.envelopeId).toBe('doc-1')
    expect(out.occurredAt).toBe('2026-02-01T14:20:00.000Z')
    expect(out.description).toBe('Document signed')
    expect(out.actorEmail).toBe('jane.doe@acme.example')
    expect(out.actorName).toBe('Jane Doe')
    expect(out.actorIp).toBe('203.0.113.10')
    expect(out.actorId).toBeUndefined()
    expect(out.platform).toBe('getaccept')
    expect(out.metadata).toEqual({
      eventName: 'Document signed',
      eventMetaData: 'meta',
      geoCity: 'Stockholm',
      geoCountryName: 'Sweden',
    })
    expect(out.raw).toBe(ROW)
  })

  it('does not guess a canonical event type from an undocumented event_name vocabulary', () => {
    for (const event_name of ['Document signed', 'signed', 'document.viewed', 'anything']) {
      const out = AuditTrailEntrySchema.parse(
        transformAuditTrailEntry({ ...ROW, event_name }, 'doc-1', 0),
      )
      expect(out.eventType).toBe('unknown')
    }
  })

  it('leaves actor fields undefined when the row carries none', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry({ created_at: ROW.created_at, event_name: 'x' }, 'doc-1', 0),
    )
    expect(out.actorEmail).toBeUndefined()
    expect(out.actorName).toBeUndefined()
    expect(out.actorIp).toBeUndefined()
    expect(out.metadata).toEqual({ eventName: 'x' })
  })

  it('throws instead of inventing a timestamp when created_at is missing or unparseable', () => {
    expect(() => transformAuditTrailEntry({ event_name: 'x' }, 'doc-1', 0)).toThrow(/created_at/)
    expect(() =>
      transformAuditTrailEntry({ event_name: 'x', created_at: 'not a date' }, 'doc-1', 0),
    ).toThrow(/created_at/)
  })

  it('throws instead of inventing a description when event_name is missing or empty', () => {
    expect(() => transformAuditTrailEntry({ created_at: ROW.created_at }, 'doc-1', 0)).toThrow(
      /event_name/,
    )
    expect(() =>
      transformAuditTrailEntry({ created_at: ROW.created_at, event_name: '' }, 'doc-1', 0),
    ).toThrow(/event_name/)
  })
})
