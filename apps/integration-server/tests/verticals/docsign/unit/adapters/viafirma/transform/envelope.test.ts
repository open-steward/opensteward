import { describe, it, expect } from 'vitest'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/viafirma/transform/envelope'
import type { RawViafirmaSet } from '../../../../../../../src/verticals/docsign/adapters/viafirma/transform/shared'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('viafirma transformEnvelope', () => {
  it('maps a completed SET to canonical Envelope', () => {
    const raw: RawViafirmaSet = {
      code: 'set-001',
      status: 'RESPONSED',
      title: 'NDA Contract',
      description: 'Please sign the NDA.',
      userCode: 'u-alice',
      userName: 'Alice Admin',
      groupCode: 'grp-1',
      groupTitle: 'Legal',
      externalCode: 'ext-001',
      externalStatus: 'done',
      creationDate: 1735689600000,
      updateDate: 1736294400000,
      expirationDate: 1738886400000,
      links: [
        { key: 'link-1', messageCode: 'msg-1', mail: 'bob@example.com', name: 'Bob', order: 1 },
        { key: 'link-2', messageCode: 'msg-2', mail: 'carol@example.com', name: 'Carol', order: 2 },
      ],
      messages: [{ code: 'msg-1' }, { code: 'msg-2' }],
    }

    const result = transformEnvelope(raw)

    // id maps from raw.code
    expect(result.id).toBe('set-001')
    expect(result.externalId).toBe('set-001')
    // RESPONSED → completed
    expect(result.status).toBe('completed')
    expect(result.subject).toBe('NDA Contract')
    expect(result.message).toBe('Please sign the NDA.')
    expect(result.senderId).toBe('u-alice')
    expect(result.senderName).toBe('Alice Admin')
    // two distinct order values → sequential
    expect(result.signingOrder).toBe('sequential')
    // signerIds gathered from links sorted by order, using messageCode
    expect(result.signerIds).toEqual(['msg-1', 'msg-2'])
    expect(result.documentIds).toEqual(['msg-1', 'msg-2'])
    expect(result.platform).toBe('viafirma')
    // completedAt set for RESPONSED status
    expect(result.completedAt).toBeDefined()
    expect(result.metadata.groupCode).toBe('grp-1')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status variations correctly', () => {
    const check = (status: string | undefined) => transformEnvelope({ code: 'x', status }).status

    expect(check('DRAFT')).toBe('draft')
    expect(check('PENDING')).toBe('draft')
    expect(check('SENT')).toBe('sent')
    expect(check('RECEIVED')).toBe('delivered')
    expect(check('OPENED')).toBe('delivered')
    expect(check('WAITING_CHECK')).toBe('completed')
    expect(check('RESPONSED')).toBe('completed')
    expect(check('SIGNED')).toBe('completed')
    expect(check('FINISHED')).toBe('completed')
    expect(check('REJECTED')).toBe('declined')
    expect(check('EXPIRED')).toBe('expired')
    expect(check('CANCELED')).toBe('voided')
    expect(check('CANCELLED')).toBe('voided')
    expect(check('ERROR')).toBe('voided')
    // unknown falls back to draft
    expect(check('UNKNOWN')).toBe('draft')
    expect(check(undefined)).toBe('draft')
  })

  it('sets declinedAt and not completedAt when REJECTED', () => {
    const raw: RawViafirmaSet = {
      code: 'set-002',
      status: 'REJECTED',
      updateDate: 1736294400000,
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBeDefined()
    expect(result.completedAt).toBeUndefined()
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('detects parallel order when all links share the same order', () => {
    const raw: RawViafirmaSet = {
      code: 'set-003',
      links: [
        { key: 'k1', order: 1 },
        { key: 'k2', order: 1 },
      ],
    }
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('parallel')
  })

  it('produces valid envelope with no links or messages', () => {
    const result = transformEnvelope({ code: 'set-empty' })
    expect(result.signerIds).toEqual([])
    expect(result.documentIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
