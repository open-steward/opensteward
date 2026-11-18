/**
 * A Mifiel document — one file with its stakeholders — is the canonical
 * envelope. The record is a `POST /api/query` `{"resource": "document"}` row
 * holding only the requested `fields` (DOCUMENT_FIELDS in index.ts):
 *   - `id`, `file_file_name`, `created_at`, `state` — the guide's records, e.g.
 *     `{ "id": "32214f64-…", "file_file_name": "demo.pdf",
 *        "created_at": "2021-07-21T17:05:36.821Z", "state": "pending" }`
 *     (https://guia.mifiel.com/como-hacer-busquedas-avanzadas-api);
 *   - `signed` — "Whether the document has been signed by all parties"
 *     (CreateDocumentResponse, https://docs.mifiel.com/en/api.json);
 *   - `stakeholders(...)` — see ./signer.ts.
 */
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, toIso } from './shared'
import { isSigner, type RawMifielStakeholder } from './signer'

export interface RawMifielQueryDocument {
  id?: string | null
  file_file_name?: string | null
  state?: string | null
  signed?: boolean | null
  created_at?: string | null
  stakeholders?: RawMifielStakeholder[] | null
  [key: string]: unknown
}

/**
 * `signed: true` is documented as signed by all parties. The only documented
 * document state is "pending" (CreateDocumentResponse.state enum ["pending"];
 * the guide's "documentos sin firmar" query filters `state eq pending`), a
 * document out for signature. Anything else is not guessed.
 */
function mapStatus(raw: RawMifielQueryDocument): EnvelopeStatus {
  if (raw.signed === true) return 'completed'
  if (raw.state === 'pending') return 'sent'
  return 'unknown'
}

export function requireId(raw: RawMifielQueryDocument): string {
  const id = pickStr(raw.id)
  if (!id) throw new Error('mifiel query record has no id')
  return id
}

export function requireFileName(raw: RawMifielQueryDocument, id: string): string {
  const name = pickStr(raw.file_file_name)
  if (!name) throw new Error(`mifiel document ${id} has no file_file_name`)
  return name
}

export function transformEnvelope(raw: RawMifielQueryDocument): Envelope {
  const id = requireId(raw)
  const signerIds = (raw.stakeholders ?? []).filter(isSigner).map((s) => {
    const sid = pickStr(s.id)
    if (!sid) throw new Error(`mifiel stakeholder of document ${id} has no id`)
    return sid
  })
  const metadata: Record<string, string> = {}
  const state = pickStr(raw.state)
  if (state) metadata['state'] = state
  return {
    id,
    externalId: id,
    status: mapStatus(raw),
    subject: requireFileName(raw, id),
    // No ordering is documented anywhere in api.json: CreateDocumentRequest
    // takes one `signatories` list with no order parameter, and neither
    // Signatory, CreateStakeholderRequest nor DocumentStateSigningGroup
    // (id, name, state, stakeholders) carries an order or sequence field. The
    // canonical enum has no unknown value, so this is the documented shape
    // (one unordered list), not a value read from the record.
    signingOrder: 'parallel',
    signerIds,
    // The document is its own single file (see ./document.ts).
    documentIds: [id],
    createdAt: toIso(raw.created_at),
    platform: 'mifiel',
    metadata,
    raw,
  }
}
