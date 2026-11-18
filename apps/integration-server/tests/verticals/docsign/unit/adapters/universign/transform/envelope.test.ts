import { describe, it, expect } from 'vitest'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/universign/transform/envelope'
import type { RawUniversignTransaction } from '../../../../../../../src/verticals/docsign/adapters/universign/transform/types'
import { CANCEL_TRANSACTION, RETRIEVE_TRANSACTION, START_TRANSACTION } from '../fixtures'

const tx = (v: unknown) => v as RawUniversignTransaction

describe('universign transformEnvelope (documented transaction object)', () => {
  it('maps the "Start a transaction" example and survives EnvelopeSchema', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(tx(START_TRANSACTION)))
    expect(out.id).toBe('tx_YLyDVeWbgW0z')
    expect(out.externalId).toBe('tx_YLyDVeWbgW0z')
    expect(out.status).toBe('sent')
    expect(out.subject).toBe('NewName')
    expect(out.signingOrder).toBe('sequential')
    expect(out.signerIds).toEqual([
      'tx_YLyDVeWbgW0z:John@universign.com',
      'tx_YLyDVeWbgW0z:$UnknownParticipant',
      'tx_YLyDVeWbgW0z:jean@universign.com',
      'tx_YLyDVeWbgW0z:jane@universign.com',
    ])
    expect(out.documentIds).toEqual(['tx_YLyDVeWbgW0z:doc_Bdk'])
    expect(out.createdAt).toBe('2026-09-21T13:42:10.887Z')
    expect(out.sentAt).toBe('2026-09-21T13:51:35.978Z')
    expect(out.expiresAt).toBe('2026-09-24T13:51:35.978Z')
    expect(out.completedAt).toBeUndefined()
    expect(out.metadata).toMatchObject({
      state: 'started',
      folderId: 'fol_JxmJlV5P922X',
      language: 'en',
    })
    // API-created: the creator is a workspace + key, not a person.
    expect(out.senderEmail).toBeUndefined()
    expect(out.senderName).toBeUndefined()
  })

  it('maps a draft with no name default, no sequencing, no participants', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(tx(RETRIEVE_TRANSACTION)))
    expect(out.status).toBe('draft')
    expect(out.signingOrder).toBe('parallel')
    expect(out.signerIds).toEqual([])
    expect(out.documentIds).toEqual([])
    const unnamed = EnvelopeSchema.parse(
      transformEnvelope(tx({ ...RETRIEVE_TRANSACTION, name: undefined })),
    )
    // "The transaction name. Default value is the transaction ID."
    expect(unnamed.subject).toBe('tx_YLyDVeWbgW0z')
  })

  it('maps cancelled to voided with closed_at as voidedAt', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(tx(CANCEL_TRANSACTION)))
    expect(out.status).toBe('voided')
    expect(out.voidedAt).toBe('2026-09-21T13:51:40.265Z')
    expect(out.completedAt).toBeUndefined()
  })

  it('maps every documented state', () => {
    const cases: Array<[string, string]> = [
      ['draft', 'draft'],
      ['started', 'sent'],
      ['paused', 'unknown'],
      ['cancelled', 'voided'],
      ['expired', 'expired'],
      ['closed', 'completed'],
      ['completed', 'completed'],
    ]
    for (const [state, status] of cases) {
      const out = EnvelopeSchema.parse(transformEnvelope(tx({ ...CANCEL_TRANSACTION, state })))
      expect(out.status, state).toBe(status)
      if (status === 'completed') expect(out.completedAt).toBe('2026-09-21T13:51:40.265Z')
      else expect(out.completedAt, state).toBeUndefined()
      if (status === 'voided') expect(out.voidedAt).toBe('2026-09-21T13:51:40.265Z')
      else expect(out.voidedAt, state).toBeUndefined()
    }
  })

  it('drops an unparseable timestamp instead of passing it through', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope(tx({ ...RETRIEVE_TRANSACTION, created_at: 'not a date' })),
    )
    expect(out.createdAt).toBeUndefined()
  })

  it('reads creator.email as senderEmail only when it is an e-mail', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope(
        tx({ ...RETRIEVE_TRANSACTION, creator: { name: 'John DOE', email: 'John DOE' } }),
      ),
    )
    expect(out.senderEmail).toBeUndefined()
    expect(out.senderName).toBe('John DOE')
  })

  it('reads a web-app creator as the sender', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope(
        tx({
          ...RETRIEVE_TRANSACTION,
          creator: { name: 'John DOE', email: 'john.doe@example.com' },
        }),
      ),
    )
    expect(out.senderEmail).toBe('john.doe@example.com')
    expect(out.senderName).toBe('John DOE')
  })
})
