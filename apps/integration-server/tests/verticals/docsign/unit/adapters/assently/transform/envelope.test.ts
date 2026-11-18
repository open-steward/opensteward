import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawAssentlyCase,
} from '../../../../../../../src/verticals/docsign/adapters/assently/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('assently transformEnvelope', () => {
  it('maps a finished case to canonical Envelope', () => {
    const raw: RawAssentlyCase = {
      caseId: 'case-001',
      status: 'finished',
      name: 'Supply Agreement',
      templateId: 'tmpl-99',
      culture: 'en-US',
      useSigningOrder: true,
      createdBy: 'usr-alice',
      createdOn: '2026-01-01T00:00:00.000Z',
      sentOn: '2026-01-02T00:00:00.000Z',
      finishedOn: '2026-01-10T00:00:00.000Z',
      expiresOn: '2026-03-01T00:00:00.000Z',
      parties: [
        { id: 'pty-1', signsAs: 0 },
        { id: 'pty-2', signsAs: 1 },
      ],
      documents: [{ id: 'doc-a' }, { id: 'doc-b' }],
    }

    const result = transformEnvelope(raw)

    // id from caseId
    expect(result.id).toBe('case-001')
    expect(result.externalId).toBe('case-001')
    // 'finished' → 'completed'
    expect(result.status).toBe('completed')
    expect(result.subject).toBe('Supply Agreement')
    expect(result.senderId).toBe('usr-alice')
    // useSigningOrder true → sequential
    expect(result.signingOrder).toBe('sequential')
    // signerIds sorted by signsAs
    expect(result.signerIds).toEqual(['pty-1', 'pty-2'])
    expect(result.documentIds).toEqual(['doc-a', 'doc-b'])
    expect(result.templateId).toBe('tmpl-99')
    expect(result.platform).toBe('assently')
    // culture in metadata
    expect(result.metadata.culture).toBe('en-US')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status values correctly', () => {
    const check = (status: string | undefined, rejected?: boolean) =>
      transformEnvelope({ caseId: 'x', status, rejected }).status

    expect(check('draft')).toBe('draft')
    expect(check('pending')).toBe('draft')
    expect(check('sent')).toBe('sent')
    expect(check('pendingapproval')).toBe('sent')
    expect(check('finished')).toBe('completed')
    expect(check('signed')).toBe('completed')
    expect(check('rejected')).toBe('declined')
    expect(check('failed')).toBe('declined')
    expect(check('expired')).toBe('expired')
    expect(check('recalled')).toBe('voided')
    expect(check('cancelled')).toBe('voided')
    expect(check('canceled')).toBe('voided')
    // rejected=true overrides status
    expect(check('sent', true)).toBe('declined')
  })

  it('uses id field when caseId is absent', () => {
    const result = transformEnvelope({ id: 'alt-id', status: 'sent' })
    expect(result.id).toBe('alt-id')
  })

  it('derives sequential signing order from distinct signsAs groups', () => {
    const raw: RawAssentlyCase = {
      caseId: 'c',
      parties: [
        { id: 'p1', signsAs: 0 },
        { id: 'p2', signsAs: 1 },
      ],
    }
    expect(transformEnvelope(raw).signingOrder).toBe('sequential')
  })

  it('derives parallel when all parties share the same signsAs', () => {
    const raw: RawAssentlyCase = {
      caseId: 'c',
      parties: [
        { id: 'p1', signsAs: 0 },
        { id: 'p2', signsAs: 0 },
      ],
    }
    expect(transformEnvelope(raw).signingOrder).toBe('parallel')
  })

  it('updatedAt falls back through reminderSentOn → finishedOn → sentOn → createdOn', () => {
    const r1 = transformEnvelope({ caseId: 'x', reminderSentOn: '2026-02-01T00:00:00.000Z' })
    expect(r1.updatedAt).toBe('2026-02-01T00:00:00.000Z')

    const r2 = transformEnvelope({
      caseId: 'x',
      finishedOn: '2026-01-10T00:00:00.000Z',
      sentOn: '2026-01-02T00:00:00.000Z',
    })
    expect(r2.updatedAt).toBe('2026-01-10T00:00:00.000Z')
  })

  it('produces empty signerIds and documentIds when arrays absent', () => {
    const result = transformEnvelope({ caseId: 'x' })
    expect(result.signerIds).toEqual([])
    expect(result.documentIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
