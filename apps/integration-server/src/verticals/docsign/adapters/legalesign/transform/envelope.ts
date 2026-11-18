import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { idFromUri, strMap, toIso } from './shared'
import type { RawLegalesignSigner } from './signer'

/**
 * A Legalesign "document" is a sent envelope. The list endpoint returns
 * signers as 8-element string tuples
 * `[uri, firstName, lastName, email, sms, hasFields, status, order]`; the
 * detail endpoint additionally exposes structured `signer_objects` (see
 * `RawLegalesignSigner`). We read `signer_objects` when present and fall back
 * to the tuple form otherwise.
 */
export interface RawLegalesignDocument {
  uuid: string
  resource_uri?: string
  name?: string
  status?: number
  archived?: boolean
  created?: string
  modified?: string
  sign_time?: string
  group?: string
  user?: string
  cc_emails?: string
  redirect?: string
  hash_value?: string
  signers_in_order?: boolean | number
  // List form: nested tuples. Detail form: also present.
  signers?: Array<string[]>
  // Detail form only.
  signer_objects?: RawLegalesignSigner[]
  template?: string | null
  templatepdf?: string | null
  tag?: string
  tag1?: string
  tag2?: string
  [key: string]: unknown
}

/** Tuple index map for the list-endpoint `signers` arrays. */
const TUPLE = {
  uri: 0,
  firstName: 1,
  lastName: 2,
  email: 3,
  sms: 4,
  hasFields: 5,
  status: 6,
  order: 7,
} as const

/**
 * Document status codes (DocumentStatusEnum):
 *   10 created (check signer status for sent/unsent), 20 fields completed,
 *   30 signed, 40 removed/voided, 50 rejected.
 */
function mapStatus(raw: RawLegalesignDocument): EnvelopeStatus {
  switch (Number(raw.status)) {
    case 30:
      return 'completed'
    case 40:
      return 'voided'
    case 50:
      return 'declined'
    case 20:
    case 10:
    default:
      // Status 10/20 means the envelope is in-flight once any signer has been
      // sent their request. If no signer has progressed past "unsent" (4), it
      // is still effectively a draft.
      return anySignerSent(raw) ? 'sent' : 'draft'
  }
}

function signerStatuses(raw: RawLegalesignDocument): number[] {
  if (raw.signer_objects && raw.signer_objects.length > 0) {
    return raw.signer_objects.map((s) => Number(s.status ?? 4))
  }
  return (raw.signers ?? []).map((t) => Number(t[TUPLE.status] ?? '4'))
}

function anySignerSent(raw: RawLegalesignDocument): boolean {
  return signerStatuses(raw).some((s) => s >= 10)
}

function signerIds(raw: RawLegalesignDocument): string[] {
  if (raw.signer_objects && raw.signer_objects.length > 0) {
    return [...raw.signer_objects]
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      .map((s) => s.uuid ?? idFromUri(s.resource_uri) ?? '')
      .filter((id) => id.length > 0)
  }
  return [...(raw.signers ?? [])]
    .sort((a, b) => Number(a[TUPLE.order] ?? '0') - Number(b[TUPLE.order] ?? '0'))
    .map((t) => idFromUri(t[TUPLE.uri]) ?? '')
    .filter((id) => id.length > 0)
}

function mapSigningOrder(raw: RawLegalesignDocument): 'parallel' | 'sequential' {
  const v = raw.signers_in_order
  return v === true || v === 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawLegalesignDocument): Envelope {
  const templateId = idFromUri(raw.templatepdf ?? undefined) ?? idFromUri(raw.template ?? undefined)
  return {
    id: raw.uuid,
    externalId: raw.uuid,
    status: mapStatus(raw),
    subject: raw.name ?? '',
    senderId: idFromUri(raw.user),
    signingOrder: mapSigningOrder(raw),
    signerIds: signerIds(raw),
    // Legalesign signs a single composed PDF per document; the document id is
    // its own document handle (see transform/document.ts).
    documentIds: [raw.uuid],
    templateId,
    createdAt: toIso(raw.created),
    completedAt: Number(raw.status) === 30 ? toIso(raw.sign_time ?? raw.modified) : undefined,
    voidedAt: Number(raw.status) === 40 ? toIso(raw.modified) : undefined,
    declinedAt: Number(raw.status) === 50 ? toIso(raw.modified) : undefined,
    updatedAt: toIso(raw.modified),
    platform: 'legalesign',
    metadata: strMap({
      group: idFromUri(raw.group),
      ccEmails: raw.cc_emails,
      redirect: raw.redirect,
      hashValue: raw.hash_value,
      archived: raw.archived,
      statusCode: raw.status,
      tag: raw.tag,
      tag1: raw.tag1,
      tag2: raw.tag2,
    }),
    raw,
  }
}
