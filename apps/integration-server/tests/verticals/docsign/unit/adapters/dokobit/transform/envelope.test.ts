import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawDokobitSigningListRow,
  type RawDokobitSigningStatus,
} from '../../../../../../../src/verticals/docsign/adapters/dokobit/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { SIGNING_LIST_EXAMPLE, SIGNING_STATUS_EXAMPLE } from './fixtures'

const row = SIGNING_LIST_EXAMPLE.signings[1] as RawDokobitSigningListRow
const status = SIGNING_STATUS_EXAMPLE as RawDokobitSigningStatus

describe('dokobit transformEnvelope', () => {
  it('maps the documented list row and status.json body onto the canonical schema', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(row.token, status, row))
    expect(out.id).toBe('2f04007b083fc89b3b99c24b3d4b3654')
    expect(out.externalId).toBe('2f04007b083fc89b3b99c24b3d4b3654')
    expect(out.subject).toBe('Document to sign')
    expect(out.status).toBe('completed')
    expect(out.expiresAt).toBe('2018-01-12T08:07:10.000Z')
    expect(out.templateId).toBe('45daf7cee3ede21aab3d5fbf19e2dc1991d1db55')
    expect(out.signerIds).toEqual([
      'fac1c3834b37f8bebf2f3584d1b8b222a2262def',
      '595b357172b142cab7792c3324a1155bd47090ad',
      '595b357172b142cab7792c3324a1155bd47090ao',
    ])
    expect(out.documentIds).toEqual(['2f04007b083fc89b3b99c24b3d4b3654:0'])
    expect(out.signingOrder).toBe('parallel')
    expect(out.metadata).toEqual({
      type: 'pdf',
      isInTrashBin: 'false',
      lastSignatureDate: '2024-01-11T15:47:50+02:00',
      isQualifiedSignatureRequired: 'false',
    })
    expect(out.platform).toBe('dokobit')
  })

  it('maps a status.json body alone (getEnvelope) without list-only metadata', () => {
    const out = EnvelopeSchema.parse(transformEnvelope('tok-1', status))
    expect(out.id).toBe('tok-1')
    expect(out.metadata).toEqual({ type: 'pdf', isQualifiedSignatureRequired: 'false' })
  })

  it.each([
    ['pending', 'sent'],
    ['completed', 'completed'],
    ['declined', 'declined'],
    ['archived', 'unknown'],
  ])('maps documented signing status %s to %s', (s, expected) => {
    const out = EnvelopeSchema.parse(transformEnvelope('t', { ...status, status: s }))
    expect(out.status).toBe(expected)
  })

  it('keeps file download URLs and signer certificates out of raw', () => {
    const out = transformEnvelope(row.token, status, row)
    const raw = JSON.stringify(out.raw)
    expect(raw).not.toContain('/download')
    expect(raw).not.toContain('BEGIN CERTIFICATE')
    expect(raw).not.toContain('11412090004')
  })

  it('throws when the required signing name is absent instead of inventing a subject', () => {
    const { name: _name, ...noName } = status
    expect(() => transformEnvelope('t', noName)).toThrow(/name/)
  })

  it('carries the list row document_number and client_code into metadata', () => {
    // Both are documented list.json row fields; the documented example has them null.
    const filled = { ...row, document_number: 'DOC-7', client_code: 'C-42' }
    const out = EnvelopeSchema.parse(transformEnvelope(filled.token, status, filled))
    expect(out.metadata?.['documentNumber']).toBe('DOC-7')
    expect(out.metadata?.['clientCode']).toBe('C-42')
  })
})
