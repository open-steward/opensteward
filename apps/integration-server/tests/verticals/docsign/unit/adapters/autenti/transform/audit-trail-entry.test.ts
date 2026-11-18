import { describe, it, expect } from 'vitest'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { transformAuditTrailEntry } from '../../../../../../../src/verticals/docsign/adapters/autenti/transform/audit-trail-entry'
import { documentProcessInProgress, documentSentEvent, eventExamples } from '../fixtures'

const ENV = 'DOCUMENT_PROCESS:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

describe('Autenti transformAuditTrailEntry (Event)', () => {
  it('maps the documented SIGNATURE_REJECTION example', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(eventExamples()[0]!, ENV))
    expect(out.id).toBe('EVENT-AUTENTI:f42c1e87-f814-4b89-b307-adff56b59b0f')
    expect(out.envelopeId).toBe(ENV)
    expect(out.occurredAt).toBe('2023-11-13T20:20:39.000Z')
    expect(out.eventType).toBe('declined')
    expect(out.description).toBe('EVENT_CLASSIFIER-UNIQUE_TYPE:SIGNATURE_REJECTION')
    expect(out.actorId).toBe('PARTY-EMAIL:john@smith.com')
    expect(out.metadata).toEqual({ objectId: 'DOCUMENT-a1ba4e0a-5cb1-11eb-ae93-0242ac130002' })
  })

  it('maps an event with a null actor', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(eventExamples()[1]!, ENV))
    expect(out.eventType).toBe('other')
    expect(out.actorId).toBeUndefined()
    expect(out.metadata).toEqual({
      objectId: 'PARTY-EMAIL:john@smith.com',
      objectType: 'EVENT_OBJECT-TYPE:PARTY',
    })
  })

  it('maps the documented DOCUMENT_SENT event', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(documentSentEvent(), ENV))
    expect(out.eventType).toBe('sent')
    expect(out.actorId).toBe('PARTY-PUBLIC_SENDER_ID:xxxxxxxx')
  })

  it.each([
    ['SIGNATURE_APPLICATION', 'signed'],
    ['DOCUMENT_DRAFT_CREATED', 'created'],
    ['DOCUMENT_VIEW', 'viewed'],
    ['DOCUMENT_WITHDRAWAL', 'voided'],
    ['DOCUMENT_PROCESS_COMPLETED', 'completed'],
    ['HAND_OVER', 'reassigned'],
    ['IDENTITY_VERIFICATION_COMPLETED', 'authenticated'],
    ['SOMETHING_NEW', 'other'],
  ])('maps EventType %s to %s', (t, expected) => {
    const raw = { ...documentSentEvent(), eventType: `EVENT_CLASSIFIER-UNIQUE_TYPE:${t}` }
    expect(AuditTrailEntrySchema.parse(transformAuditTrailEntry(raw, ENV)).eventType).toBe(expected)
  })

  it('reads the actor e-mail from the actor Party contacts', () => {
    // Event.actor is `$ref: '#/components/schemas/Party'`; this actor is the
    // documented Party of the DocumentProcessInProgress example.
    const actor = documentProcessInProgress().parties[2]!.party
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry({ ...documentSentEvent(), actor }, ENV),
    )
    expect(out.actorId).toBe('PARTY-PUBLIC_SIGNING_PROCESS_ID:bdb551b2')
    expect(out.actorName).toBe('Maurice Chevaller')
    expect(out.actorEmail).toBe('chevallier1981@gmail.com')
  })

  it('throws rather than inventing an id or a timestamp', () => {
    const { id: _i, ...noId } = documentSentEvent()
    expect(() => transformAuditTrailEntry(noId, ENV)).toThrow(/no id/)
    const { timestamp: _t, ...noTs } = documentSentEvent()
    expect(() => transformAuditTrailEntry(noTs, ENV)).toThrow(/no timestamp/)
  })
})
