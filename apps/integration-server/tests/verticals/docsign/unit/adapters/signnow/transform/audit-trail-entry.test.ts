/**
 * SignNow `GET /document/{document_id}/historyfull` rows → canonical
 * AuditTrailEntry.
 *
 * Fixtures are copied from the documented examples at
 * https://docs.signnow.com/docs/document/operations/get-document-historyfull
 * ("Example 1" and the `signer_authentication_success` example). The row
 * fields documented there are client_app_name, client_timestamp, created,
 * document_id, element_id, email, event, field_id, ip_address,
 * json_attributes, origin, unique_id and user_id. There is no user name.
 */
import { describe, it, expect } from 'vitest'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import {
  transformAuditTrailEntry,
  type RawSignNowHistoryEntry,
} from '../../../../../../../src/verticals/docsign/adapters/signnow/transform/audit-trail-entry'

/** "Example 1", document_history[0], verbatim. */
const DOC_EXAMPLE_ROW: RawSignNowHistoryEntry = {
  client_app_name: 'Sample Application',
  client_timestamp: 1622029581,
  created: 1622029581,
  document_id: 'ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  element_id: 'ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  email: 'johndoe@email.com',
  event: 'create_document',
  field_id: 'ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  ip_address: '1X.XX.XX.XX',
  json_attributes: '{"some":"data"}',
  origin: 'original',
  unique_id: 'ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  user_id: 'ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
}

/** The `signer_authentication_success` example, 4th row, verbatim: string epochs. */
const AUTH_SUCCESS_ROW: RawSignNowHistoryEntry = {
  client_app_name: 'Signer Application',
  client_timestamp: '1672128445',
  created: '1672128445',
  document_id: 'bbXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  element_id: null,
  email: 'signer1@email.com',
  event: 'signer_authentication_success',
  field_id: null,
  ip_address: '35.263.222.70',
  json_attributes: {
    authentication_code: '57329',
    authentication_type: 'sms',
    phone_number_2fa: '+1XXX-XXXXXXX',
  },
  unique_id: '6dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  user_id: '6aXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
}

const ENV = 'ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'

describe('transformAuditTrailEntry (SignNow historyfull)', () => {
  it('maps the documented Example 1 row and parses against the canonical schema', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(DOC_EXAMPLE_ROW, ENV))
    expect(out.id).toBe(`${ENV}:ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`)
    expect(out.externalId).toBe('ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')
    expect(out.envelopeId).toBe(ENV)
    expect(out.occurredAt).toBe('2021-05-26T11:46:21.000Z')
    expect(out.eventType).toBe('created')
    expect(out.description).toBe('create_document')
    expect(out.actorId).toBe('ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')
    expect(out.actorEmail).toBe('johndoe@email.com')
    expect(out.actorName).toBeUndefined()
    expect(out.actorIp).toBe('1X.XX.XX.XX')
    expect(out.platform).toBe('signnow')
    expect(out.metadata).toEqual({ origin: 'original', clientAppName: 'Sample Application' })
  })

  it('reads the documented string epoch in `created` and maps signer_authentication_success', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry(AUTH_SUCCESS_ROW, 'bbXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
    )
    expect(out.occurredAt).toBe('2022-12-27T08:07:25.000Z')
    expect(out.eventType).toBe('authenticated')
    expect(out.externalId).toBe('6dXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')
    expect(out.metadata).toEqual({ clientAppName: 'Signer Application' })
  })

  it('takes occurredAt from `created`, not the nullable client_timestamp', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry(
        { ...DOC_EXAMPLE_ROW, client_timestamp: null, created: 1672751407 },
        ENV,
      ),
    )
    expect(out.occurredAt).toBe('2023-01-03T13:10:07.000Z')
  })

  it.each([
    ['create_document', 'created'],
    ['created_document', 'created'],
    ['document_invite_sent', 'sent'],
    ['added_signature', 'signed'],
    ['signer_authentication_success', 'authenticated'],
    ['signer_authentication_failure', 'other'],
    ['document_signing_session_completed', 'other'],
    ['some_undocumented_event', 'unknown'],
  ] as const)('maps documented event %s to %s', (event, expected) => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry({ ...DOC_EXAMPLE_ROW, event }, ENV),
    )
    expect(out.eventType).toBe(expected)
    expect(out.description).toBe(event)
  })

  it('throws rather than inventing an id when unique_id is absent', () => {
    const { unique_id: _u, ...row } = DOC_EXAMPLE_ROW
    expect(() => transformAuditTrailEntry(row, ENV)).toThrow(/unique_id/)
  })

  it('throws rather than inventing a timestamp when created is absent', () => {
    const { created: _c, ...row } = DOC_EXAMPLE_ROW
    expect(() => transformAuditTrailEntry(row, ENV)).toThrow(/created/)
  })

  it('throws when event is absent', () => {
    const { event: _e, ...row } = DOC_EXAMPLE_ROW
    expect(() => transformAuditTrailEntry(row, ENV)).toThrow(/event/)
  })
})
