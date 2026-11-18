import { describe, it, expect } from 'vitest'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { transformAuditTrailEntry } from '../../../../../../../src/verticals/docsign/adapters/rightsignature/transform/audit-trail-entry'
import { ARCHIVED_AUDITS } from '../fixtures'

const DOC_ID = '4840dd4f-2c13-4395-a0e0-3577d1eed6fd'

describe('RightSignature transformAuditTrailEntry (document audits[])', () => {
  it('maps a documented audit onto the canonical AuditTrailEntry', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(ARCHIVED_AUDITS[1]!, DOC_ID))
    expect(out).toMatchObject({
      id: `${DOC_ID}:31`,
      externalId: '31',
      envelopeId: DOC_ID,
      occurredAt: '2020-04-22T07:55:02.000Z',
      eventType: 'created',
      description: 'Document created by Ad (test@test.com).',
      actorIp: '10.0.2.2',
      platform: 'rightsignature',
      metadata: { keyword: 'created', user_id: '2', account_id: '2', document_id: '5' },
    })
    expect(out.actorId).toBeUndefined()
  })

  it('maps each documented keyword', () => {
    const types = ARCHIVED_AUDITS.map(
      (a) => AuditTrailEntrySchema.parse(transformAuditTrailEntry(a, DOC_ID)).eventType,
    )
    expect(types).toEqual(['completed', 'created', 'signed', 'viewed'])
  })

  it('a null ip_address is omitted', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(ARCHIVED_AUDITS[0]!, DOC_ID))
    expect(out.actorIp).toBeUndefined()
  })

  it('an undocumented keyword is "other", a missing one "unknown"', () => {
    const base = ARCHIVED_AUDITS[0]!
    expect(
      AuditTrailEntrySchema.parse(
        transformAuditTrailEntry({ ...base, metadata: { keyword: 'shared' } }, DOC_ID),
      ).eventType,
    ).toBe('other')
    expect(
      AuditTrailEntrySchema.parse(transformAuditTrailEntry({ ...base, metadata: null }, DOC_ID))
        .eventType,
    ).toBe('unknown')
  })

  it('throws rather than inventing a timestamp', () => {
    const { created_at: _omit, ...noTime } = ARCHIVED_AUDITS[0]!
    expect(() => transformAuditTrailEntry(noTime, DOC_ID)).toThrow(/no created_at/)
  })

  it('throws rather than inventing a description', () => {
    const { payload: _omit, ...noPayload } = ARCHIVED_AUDITS[0]!
    expect(() => transformAuditTrailEntry(noPayload, DOC_ID)).toThrow(/no payload/)
  })

  it('throws on an audit with no id', () => {
    const { id: _omit, ...noId } = ARCHIVED_AUDITS[0]!
    expect(() => transformAuditTrailEntry(noId as never, DOC_ID)).toThrow(/no id/)
    expect(() => transformAuditTrailEntry({ ...ARCHIVED_AUDITS[0]!, id: '' }, DOC_ID)).toThrow(
      /no id/,
    )
  })
})
