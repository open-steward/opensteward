import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  transformListRow,
  type RawESignatureEuRequest,
  type RawESignatureEuListRow,
} from '../../../../../../../src/verticals/docsign/adapters/e-signature-eu/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('e-signature-eu transformEnvelope', () => {
  it('maps a completed request with two sequential signers', () => {
    const raw: RawESignatureEuRequest = {
      id_sign: 42,
      doc_name: 'Contract.pdf',
      status_id: 'finished',
      date_status: '2026-01-15 10:30:00',
      lang: 'en',
      send_email: true,
      from_api: true,
      signers: {
        '1': {
          firstname: 'Alice',
          lastname: 'Smith',
          email: 'alice@example.com',
          sign_first: true,
        },
        '2': { firstname: 'Bob', lastname: 'Jones', email: 'bob@example.com', sign_first: false },
      },
    }
    const result = transformEnvelope(raw)

    // id is derived from id_sign stringified
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
    // finished → completed
    expect(result.status).toBe('completed')
    // doc_name becomes subject
    expect(result.subject).toBe('Contract.pdf')
    // sign_first=true on at least one signer → sequential
    expect(result.signingOrder).toBe('sequential')
    // signerIds built from id:position
    expect(result.signerIds).toEqual(['42:1', '42:2'])
    // documentIds built from id:doc
    expect(result.documentIds).toEqual(['42:doc'])
    // date_status mapped to completedAt (status=completed)
    expect(result.completedAt).toBe('2026-01-15T10:30:00.000Z')
    expect(result.voidedAt).toBeUndefined()
    expect(result.platform).toBe('e-signature-eu')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending request as status=sent and signingOrder=parallel', () => {
    const raw: RawESignatureEuRequest = {
      id_sign: '99',
      doc_name: 'NDA',
      status_id: 'pending',
      signers: {
        '1': { email: 'x@example.com' },
        '2': { email: 'y@example.com' },
      },
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('sent')
    // no sign_first flag → parallel
    expect(result.signingOrder).toBe('parallel')
    expect(result.completedAt).toBeUndefined()
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps cancelled → voided with voidedAt set', () => {
    const raw: RawESignatureEuRequest = {
      id_sign: 7,
      status_id: 'cancelled',
      date_status: '2026-03-01 08:00:00',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('voided')
    expect(result.voidedAt).toBe('2026-03-01T08:00:00.000Z')
    expect(result.completedAt).toBeUndefined()
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps unknown status → draft', () => {
    const raw: RawESignatureEuRequest = { id_sign: 1, status_id: 'unknown_xyz' }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('draft')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})

describe('e-signature-eu transformListRow', () => {
  it('maps a list row with only id and status', () => {
    const raw: RawESignatureEuListRow = { id_sign: 55, status_id: 'finished' }
    const result = transformListRow(raw)

    expect(result.id).toBe('55')
    expect(result.status).toBe('completed')
    expect(result.signerIds).toEqual([])
    expect(result.documentIds).toEqual(['55:doc'])
    expect(result.platform).toBe('e-signature-eu')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
