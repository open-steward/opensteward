import { describe, it, expect } from 'vitest'
import { transformAuditTrailEntry } from '../../../../../../../src/verticals/docsign/adapters/namirial/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { ENVELOPE_HISTORY_EXAMPLE, ENVELOPE_ID } from '../fixtures'

const event = ENVELOPE_HISTORY_EXAMPLE.Events![0]!

describe('Namirial transformAuditTrailEntry (EnvelopeGetHistoryEvent)', () => {
  it('maps a history event, keeping its free-string Type as the description', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(event, ENVELOPE_ID, 0))
    expect(out).toMatchObject({
      id: `${ENVELOPE_ID}:0`,
      externalId: `${ENVELOPE_ID}:0`,
      envelopeId: ENVELOPE_ID,
      occurredAt: '2017-07-21T17:32:28.000Z',
      eventType: 'other',
      description: 'sendSignNotification',
      actorId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      actorEmail: 'bob@example.com',
      actorName: 'Bob Builder',
      platform: 'namirial',
    })
    expect(out.metadata).toEqual({
      type: 'sendSignNotification',
      completed: 'true',
      completedOn: '2017-07-21T17:32:30.000Z',
      isInErrorState: 'false',
      traceId: 'trace-1',
    })
  })

  it('leaves the actor unset for an envelope-level event', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry(ENVELOPE_HISTORY_EXAMPLE.Events![1]!, ENVELOPE_ID, 1),
    )
    expect(out.actorId).toBeUndefined()
    expect(out.actorName).toBeUndefined()
  })

  it('throws instead of inventing a timestamp or description', () => {
    expect(() =>
      transformAuditTrailEntry({ ...event, CreationDate: undefined }, ENVELOPE_ID, 0),
    ).toThrow(/no CreationDate/)
    expect(() => transformAuditTrailEntry({ ...event, Type: undefined }, ENVELOPE_ID, 0)).toThrow(
      /no Type/,
    )
  })
})
