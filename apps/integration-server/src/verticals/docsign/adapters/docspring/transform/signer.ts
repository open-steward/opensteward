/**
 * DocSpring data request → canonical Signer.
 *
 * A data request is DocSpring's signer: "Create a Data Request to collect UETA
 * and ESIGN compliant electronic signatures"
 * (https://docspring.com/docs/forms/data-requests/). Fields are the spec's
 * `submission_data_request` / `submission_data_request_show` definitions
 * (https://docspring.com/api-docs/v1/swagger.json):
 *   state: "enum": ["pending", "completed"]
 *   viewed_at, completed_at: "type": "string", "x-nullable": true
 *   submission_id (show only): "sub_1234567890abcdef01"
 */
import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, requireStr, strMap, toIso } from './shared'

export interface RawDocSpringDataRequest {
  id: string | null
  email: string | null
  name: string | null
  order: number | null
  sort_order: number
  state: 'pending' | 'completed'
  viewed_at: string | null
  completed_at: string | null
  auth_type?: string
  /** Present on `GET /data_requests/{data_request_id}` only. */
  submission_id?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawDocSpringDataRequest): SignerStatus {
  if (raw.state === 'completed') return 'signed'
  if (raw.state === 'pending') return raw.viewed_at ? 'delivered' : 'created'
  return 'unknown'
}

export function transformSigner(raw: RawDocSpringDataRequest, envelopeId: string): Signer {
  const id = requireStr(raw.id, 'data request id')
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.email),
    // `name` is "(string, optional)" when a data request is created
    // (https://docspring.com/docs/api-guide/create-data-requests/); an unnamed
    // request has no name, not an invented one.
    name: pickStr(raw.name) ?? '',
    role: 'signer',
    status: mapStatus(raw),
    // `order` has no documented base (examples show both 0 and 1), so it is
    // kept verbatim in metadata rather than forced into the 1-indexed routingOrder.
    deliveredAt: toIso(raw.viewed_at),
    signedAt: raw.state === 'completed' ? toIso(raw.completed_at) : undefined,
    platform: 'docspring',
    metadata: strMap({ order: raw.order, sortOrder: raw.sort_order, authType: raw.auth_type }),
    raw,
  }
}
