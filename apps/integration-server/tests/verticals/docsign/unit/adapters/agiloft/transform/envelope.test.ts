import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawAgiloftContract,
} from '../../../../../../../src/verticals/docsign/adapters/agiloft/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

/**
 * Fixtures are rows of the documented Search JSON reply. REST - NLPSearch
 * (https://help.agiloft.com/space/HELP/119799848) "returns records in the
 * same format as REST - Search" and shows it for contracts:
 *   {"success":true,"message":"","result":[{"company_name":"Company_1.","id":31,
 *    "contract_title1":"EXAMPLE_TITLE"},{"company_name":"Company_2.","id":32,
 *    "contract_title1":"MASTER SERVICES AGREEMENT"}, …]}
 */
const DOC_ROW: RawAgiloftContract = {
  company_name: 'Company_2.',
  id: 32,
  contract_title1: 'MASTER SERVICES AGREEMENT',
}

describe('agiloft transformEnvelope', () => {
  it('maps a documented Search row to a canonical Envelope', () => {
    const result = EnvelopeSchema.parse(transformEnvelope(DOC_ROW))

    expect(result.id).toBe('32')
    expect(result.externalId).toBe('32')
    expect(result.subject).toBe('MASTER SERVICES AGREEMENT')
    expect(result.platform).toBe('agiloft')
    expect(result.raw).toEqual(DOC_ROW)
  })

  it('reports status as unknown: the Status field has no published logical name', () => {
    const result = EnvelopeSchema.parse(transformEnvelope(DOC_ROW))
    expect(result.status).toBe('unknown')
  })

  it('invents nothing it was not given', () => {
    const result = EnvelopeSchema.parse(transformEnvelope(DOC_ROW))
    expect(result.signerIds).toEqual([])
    expect(result.documentIds).toEqual([])
    expect(result.metadata).toEqual({})
    for (const k of [
      'message',
      'senderId',
      'senderEmail',
      'senderName',
      'createdAt',
      'sentAt',
      'completedAt',
      'expiresAt',
      'updatedAt',
    ] as const) {
      expect(result[k]).toBeUndefined()
    }
  })

  it('accepts a string id (EWREST encoded values are strings)', () => {
    const result = EnvelopeSchema.parse(transformEnvelope({ id: '318', contract_title1: 'NDA' }))
    expect(result.id).toBe('318')
  })

  it('throws rather than inventing a subject when Contract Title is empty', () => {
    // "Fields with empty values are returned as nulls." (REST Interface)
    expect(() => transformEnvelope({ id: 7, contract_title1: null })).toThrow(
      'Agiloft contract 7 has no contract_title1 (Contract Title)',
    )
    expect(() => transformEnvelope({ id: 7 })).toThrow(
      'Agiloft contract 7 has no contract_title1 (Contract Title)',
    )
    expect(() => transformEnvelope({ id: 7, contract_title1: '' })).toThrow(
      'Agiloft contract 7 has no contract_title1 (Contract Title)',
    )
  })

  it('throws rather than inventing an id when the row has none', () => {
    expect(() => transformEnvelope({ contract_title1: 'NDA' } as RawAgiloftContract)).toThrow(
      'Agiloft contract row has no id',
    )
  })
})
