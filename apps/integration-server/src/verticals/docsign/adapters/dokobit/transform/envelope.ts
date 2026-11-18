/**
 * Dokobit Portal API signing → canonical Envelope.
 *
 * Two documented bodies (https://beta.dokobit.com/api/doc):
 *   - a row of GET /api/signing/list.json: "Signing details include: token,
 *     status and document number value" (`token`, `status`, `document_number`,
 *     `client_code`, `is_in_trash_bin`, `last_signature_date`, `template`);
 *   - GET /api/signing/{token}/status.json: "Returns all information about
 *     signing, categories, files, signers and them certificates" (`name`,
 *     `type`, `status`, `deadline`, `categories`, `files`, `signed_file`,
 *     `signers`, `is_qualified_signature_required`, `signing_deadline`,
 *     `template`). The body does not repeat the token, so the caller passes it.
 */
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import type { RawDokobitSigner } from './signer'
import type { RawDokobitFile } from './document'
import { documentId } from './document'
import { pickStr, strMap, toIso } from './shared'

export interface RawDokobitTemplateRef {
  name?: string
  token?: string
}

export interface RawDokobitSigningListRow {
  token: string
  status?: string | null
  document_number?: string | null
  client_code?: string | null
  is_in_trash_bin?: boolean
  last_signature_date?: string | null
  template?: RawDokobitTemplateRef | null
}

export interface RawDokobitSigningStatus {
  name?: string
  type?: string
  status?: string
  deadline?: string | null
  categories?: Array<{ token?: string; name?: string }>
  files?: RawDokobitFile[]
  signed_file?: unknown
  signers?: RawDokobitSigner[]
  is_qualified_signature_required?: boolean
  signing_deadline?: unknown
  template?: RawDokobitTemplateRef | null
}

/**
 * Signing statuses: the list.json `filter` parameter's "Available values:
 * completed|pending|declined", the same three the signer_signed postback
 * documents for `status`. Anything else is not guessed at.
 */
function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'pending':
      return 'sent'
    case 'completed':
      return 'completed'
    case 'declined':
      return 'declined'
    default:
      return 'unknown'
  }
}

export function transformEnvelope(
  token: string,
  status: RawDokobitSigningStatus,
  row?: RawDokobitSigningListRow,
): Envelope {
  // `name` is a required parameter of POST /api/signing/create.json ("Signing name").
  const subject = pickStr(status.name)
  if (subject === undefined) {
    throw new Error(`Dokobit signing ${token}: status.json returned no name`)
  }
  const signers = Array.isArray(status.signers) ? status.signers : []
  const files = Array.isArray(status.files) ? status.files : []
  return {
    id: token,
    externalId: token,
    status: mapStatus(pickStr(status.status)),
    subject,
    // The create call takes signers[][sequence], but neither status.json nor
    // list.json returns it, so no order among signers can be read back.
    signingOrder: 'parallel',
    signerIds: signers.map((s) => pickStr(s.token)).filter((s): s is string => s !== undefined),
    documentIds: files.map((_, i) => documentId(token, i)),
    templateId: pickStr(status.template?.token),
    expiresAt: toIso(status.deadline),
    platform: 'dokobit',
    metadata: strMap({
      type: status.type,
      documentNumber: row?.document_number,
      clientCode: row?.client_code,
      isInTrashBin: row?.is_in_trash_bin,
      lastSignatureDate: row?.last_signature_date,
      isQualifiedSignatureRequired: status.is_qualified_signature_required,
    }),
    // File download URLs, signer personal codes and certificates stay out.
    raw: {
      list: row,
      status: {
        name: status.name,
        type: status.type,
        status: status.status,
        deadline: status.deadline,
        categories: status.categories,
        is_qualified_signature_required: status.is_qualified_signature_required,
        template: status.template,
      },
    },
  }
}
