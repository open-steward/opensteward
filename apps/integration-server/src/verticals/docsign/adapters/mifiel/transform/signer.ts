/**
 * A stakeholder of a Mifiel document, as `POST /api/query` returns it inside
 * `stakeholders(...)`. The attributes read here are the documented ones:
 *   - `stakeholders(id,email,name,tax_id)` — the reference's QueryRequest
 *     example (https://docs.mifiel.com/en/api.json);
 *   - `stakeholders(type,email,state,widget_id)` with records like
 *     `{ "type": "Signer", "email": "…", "state": "pending", … }` and
 *     `"state": "completed"` — the advanced-search guide
 *     (https://guia.mifiel.com/como-hacer-busquedas-avanzadas-api).
 */
import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr } from './shared'

export interface RawMifielStakeholder {
  id?: string | null
  type?: string | null
  email?: string | null
  name?: string | null
  state?: string | null
  [key: string]: unknown
}

/** Stakeholder `type` is "Signer" in query records (enum "signer", "reviewer" in the model). */
export function isSigner(raw: RawMifielStakeholder): boolean {
  return typeof raw.type === 'string' && raw.type.toLowerCase() === 'signer'
}

/**
 * The guide shows two stakeholder states: "pending" (the use case "documentos
 * que necesita firmar un firmante", awaiting that signer) and "completed".
 * Nothing else is documented.
 */
function mapState(state: string | null | undefined): SignerStatus {
  if (state === 'pending') return 'sent'
  if (state === 'completed') return 'signed'
  return 'unknown'
}

export function transformSigner(raw: RawMifielStakeholder, envelopeId: string): Signer {
  const id = pickStr(raw.id)
  if (!id) throw new Error(`mifiel stakeholder of document ${envelopeId} has no id`)
  const name = pickStr(raw.name)
  if (!name) throw new Error(`mifiel stakeholder ${id} has no name`)
  const metadata: Record<string, string> = {}
  const type = pickStr(raw.type)
  if (type) metadata['type'] = type
  const state = pickStr(raw.state)
  if (state) metadata['state'] = state
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.email),
    name,
    role: 'signer',
    status: mapState(raw.state),
    platform: 'mifiel',
    metadata,
    raw,
  }
}
