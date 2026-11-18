/**
 * DocSpring submission → canonical Envelope.
 *
 * A submission is one PDF job; its `data_requests` are the people asked to
 * fill and sign it. Fields are the spec's `submission` definition
 * (https://docspring.com/api-docs/v1/swagger.json):
 *   state: "enum": ["pending", "processed", "invalid_data", "error",
 *     "image_download_failed", "image_processing_failed",
 *     "waiting_for_data_requests", "syntax_error", "account_suspended",
 *     "license_revoked", "accidental"]
 *   expired: "type": "boolean"
 *   expires_at, processed_at, template_id: "type": "string", "x-nullable": true
 *   data_requests: "items": { "$ref": "#/definitions/submission_data_request" }
 */
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import type { RawDocSpringDataRequest } from './signer'
import { pickStr, requireStr, strMap, toIso } from './shared'

export interface RawDocSpringSubmission {
  id: string | null
  state: string
  expired: boolean
  expires_at: string | null
  processed_at: string | null
  template_id: string | null
  template_type?: string
  test?: boolean
  data_requests: RawDocSpringDataRequest[]
  [key: string]: unknown
}

function mapStatus(raw: RawDocSpringSubmission): EnvelopeStatus {
  if (raw.expired === true) return 'expired'
  switch (raw.state) {
    case 'processed':
      return 'completed'
    // "Create a new PDF job submission with pending data requests" — the
    // example response's state is "waiting_for_data_requests"
    // (https://docspring.com/docs/api-guide/create-data-requests/).
    case 'waiting_for_data_requests':
      return 'sent'
    default:
      return 'unknown'
  }
}

export function transformEnvelope(raw: RawDocSpringSubmission): Envelope {
  const id = requireStr(raw.id, 'submission id')
  const status = mapStatus(raw)
  return {
    id,
    externalId: id,
    status,
    // A submission has no documented title, subject or name field.
    subject: '',
    // No routing order is documented. Each data request is a separate link
    // the integrator hands out: "you can then redirect your user to a form
    // hosted on docspring.com, embed this form on your website, or send them
    // a link via email. Once all of the data requests have been completed,
    // we will generate the final PDF"
    // (https://docspring.com/docs/api-guide/create-data-requests/). The
    // data request `order` field is undocumented beyond its type, so it
    // is not read as a routing order.
    signingOrder: 'parallel',
    signerIds: (raw.data_requests ?? []).map((d) => requireStr(d.id, 'data request id')),
    // Submissions expose no document ids; see listDocuments.
    documentIds: [],
    templateId: pickStr(raw.template_id),
    completedAt: status === 'completed' ? toIso(raw.processed_at) : undefined,
    expiresAt: toIso(raw.expires_at),
    platform: 'docspring',
    metadata: strMap({ state: raw.state, test: raw.test, templateType: raw.template_type }),
    raw,
  }
}
