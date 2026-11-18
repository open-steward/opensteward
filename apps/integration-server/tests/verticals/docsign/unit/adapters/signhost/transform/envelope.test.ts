/**
 * Signhost transaction -> canonical Envelope, from the documented example
 * (see ./fixtures.ts) and the Transaction model
 * (https://developer.signhost.com/openapi/models/Transaction.md).
 */
import { describe, it, expect } from 'vitest'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/signhost/transform/envelope'
import { exampleTransaction, TRANSACTION_EXAMPLE } from './fixtures'

describe('Signhost transformEnvelope', () => {
  it('maps the documented example transaction', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(TRANSACTION_EXAMPLE))
    expect(out.id).toBe('b10ae331-af78-4e79-a39e-5b64693b6b68')
    expect(out.externalId).toBe(out.id)
    // "30: Signed - All signers have successfully signed the transaction"
    expect(out.status).toBe('completed')
    expect(out.signerIds).toEqual(['fa95495d-6c59-48e0-962a-a4552f8d6b85'])
    // "Files ... Key is the file ID"
    expect(out.documentIds).toEqual(['contract.pdf'])
    // SignRequestMode 2: "Send sequentially when ready", with SendSignRequest true
    expect(out.signingOrder).toBe('sequential')
    expect(out.createdAt).toBe('2016-06-15T21:30:00.000Z')
    expect(out.updatedAt).toBe('2016-06-15T21:38:16.000Z')
    expect(out.voidedAt).toBeUndefined()
    expect(out.platform).toBe('signhost')
    expect(out.metadata).toMatchObject({ seal: 'false', daysToExpire: '30', language: 'en' })
  })

  it.each([
    [5, 'draft'],
    [10, 'sent'],
    [20, 'delivered'],
    [30, 'completed'],
    [40, 'declined'],
    [50, 'expired'],
    [60, 'voided'],
    [70, 'unknown'],
  ] as const)('maps documented Status %i to %s', (status, expected) => {
    const raw = { ...exampleTransaction(), Status: status }
    expect(EnvelopeSchema.parse(transformEnvelope(raw)).status).toBe(expected)
  })

  it('reads the Reference as the subject', () => {
    const raw = { ...exampleTransaction(), Reference: 'Contract 2016-42' }
    expect(transformEnvelope(raw).subject).toBe('Contract 2016-42')
  })

  it('stamps voidedAt from CanceledDateTime', () => {
    const raw = {
      ...exampleTransaction(),
      Status: 60,
      CanceledDateTime: '2016-06-16T10:00:00+02:00',
    }
    expect(EnvelopeSchema.parse(transformEnvelope(raw)).voidedAt).toBe('2016-06-16T08:00:00.000Z')
  })

  it('is parallel when SignRequestMode is 1 ("Send immediately")', () => {
    const raw = { ...exampleTransaction(), SignRequestMode: 1 }
    expect(transformEnvelope(raw).signingOrder).toBe('parallel')
  })

  it('throws on a transaction without the documented Id', () => {
    const { Id: _id, ...raw } = exampleTransaction()
    expect(() => transformEnvelope(raw as never)).toThrow(/Id/)
  })
})

describe('Signhost transformEnvelope (review follow-ups)', () => {
  it('leaves voidedAt unset when a non-cancelled transaction carries CanceledDateTime', () => {
    const raw = {
      ...exampleTransaction(),
      Status: 30,
      CanceledDateTime: '2016-06-16T10:00:00+02:00',
    }
    expect(EnvelopeSchema.parse(transformEnvelope(raw)).voidedAt).toBeUndefined()
  })

  it('is sequential in mode 2 when any one signer has SendSignRequest true', () => {
    const tx = exampleTransaction()
    const s = tx.Signers[0]!
    const raw = {
      ...tx,
      SignRequestMode: 2,
      Signers: [
        { ...s, Id: 's-1', SendSignRequest: false },
        { ...s, Id: 's-2', SendSignRequest: true },
      ],
    }
    expect(transformEnvelope(raw).signingOrder).toBe('sequential')
  })

  it('is parallel in mode 2 when no signer has SendSignRequest ("Ignored if SendSignRequest is set to false")', () => {
    const tx = exampleTransaction()
    const raw = { ...tx, Signers: [{ ...tx.Signers[0]!, SendSignRequest: false }] }
    expect(transformEnvelope(raw).signingOrder).toBe('parallel')
  })

  it('takes the documented default mode 2 when SignRequestMode is absent', () => {
    const { SignRequestMode: _m, ...raw } = exampleTransaction()
    expect(transformEnvelope(raw).signingOrder).toBe('sequential')
  })

  it('carries no signing or download URL in raw', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(exampleTransaction()))
    const json = JSON.stringify(out.raw)
    expect(json).not.toContain('view.signhost.com')
    expect(json).not.toContain('/file/contract.pdf')
    const raw = out.raw as {
      Signers: Array<Record<string, unknown>>
      Files: Record<string, object>
    }
    for (const k of ['SignUrl', 'DelegateSignUrl', 'ShowUrl', 'ReceiptUrl']) {
      expect(raw.Signers[0]).not.toHaveProperty(k)
    }
    expect(raw.Files['contract.pdf']).not.toHaveProperty('Links')
    // Non-URL data stays.
    expect(raw.Signers[0]!['Email']).toBe('user@example.com')
    expect(raw.Files['contract.pdf']).toEqual({ DisplayName: 'contract.pdf' })
  })

  it('does not mutate the transaction it was given', () => {
    const tx = exampleTransaction()
    transformEnvelope(tx)
    expect(tx).toEqual(TRANSACTION_EXAMPLE)
  })
})
