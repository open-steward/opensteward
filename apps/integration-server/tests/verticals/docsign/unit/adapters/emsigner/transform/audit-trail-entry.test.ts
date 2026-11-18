import { describe, it, expect } from 'vitest'
import { transformAuditTrailEntry } from '../../../../../../../src/verticals/docsign/adapters/emsigner/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { DOCUMENT_LOG_EXAMPLE } from './fixtures'

const VIEW = DOCUMENT_LOG_EXAMPLE[0]!
const [FIRST, SECOND] = VIEW.DocumentLogs!

describe('emsigner transformAuditTrailEntry', () => {
  it('maps a GetDocumentLog entry onto a valid AuditTrailEntry', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry(FIRST!, VIEW.DocumentName, '1', 0),
    )
    expect(out.id).toBe('1:0')
    expect(out.envelopeId).toBe('1')
    expect(out.occurredAt).toBe('2026-09-24T14:04:06.939Z')
    expect(out.eventType).toBe('unknown')
    expect(out.description).toBe('sample string 3')
    expect(out.actorEmail).toBe('signer.one@example.com')
    expect(out.actorIp).toBe('sample string 4')
    expect(out.metadata['documentName']).toBe('sample string 1')
    expect(out.metadata['osAndBrowser']).toBe('sample string 5')
  })

  it('omits a UserEmail that is not an email', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry(SECOND!, VIEW.DocumentName, '1', 1),
    )
    expect(out.actorEmail).toBeUndefined()
  })

  it('throws on a DateTime without a zone instead of guessing one', () => {
    expect(() =>
      transformAuditTrailEntry(
        { ...FIRST!, DateTime: '2026-09-24T19:34:06' },
        VIEW.DocumentName,
        '1',
        0,
      ),
    ).toThrow(/no DateTime with a zone/)
    expect(() =>
      transformAuditTrailEntry({ ...FIRST!, DateTime: undefined }, VIEW.DocumentName, '1', 0),
    ).toThrow(/no DateTime with a zone/)
  })
})
