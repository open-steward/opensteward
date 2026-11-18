import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * Each person who completes a Jotform Sign document produces a submission
 * against the underlying form. We map one submission → one canonical Signer.
 *
 * Submissions are returned by `GET /form/{id}/submissions` and
 * `GET /submission/{id}`. The signer's name + email live inside the `answers`
 * map, keyed by question id, each entry carrying a `type` (e.g.
 * `control_fullname`, `control_email`) plus an `answer` value that is either a
 * scalar or — for composite fields like full name — an object.
 */
export interface RawJotformAnswer {
  name?: string
  text?: string
  type?: string
  /** Scalar value, or an object for composite fields (e.g. {first,last}). */
  answer?: unknown
  prettyFormat?: string
  order?: string
}

export interface RawJotformSubmission {
  id: string
  form_id?: string
  ip?: string
  created_at?: string
  updated_at?: string
  /** `ACTIVE` | `OVERQUOTA` | `DELETED` — submission lifecycle on the form. */
  status?: string
  new?: string
  flag?: string
  answers?: Record<string, RawJotformAnswer>
  [key: string]: unknown
}

function flattenName(answer: unknown): string | undefined {
  if (typeof answer === 'string') return answer.length > 0 ? answer : undefined
  if (answer && typeof answer === 'object') {
    const o = answer as Record<string, unknown>
    const parts = [o['prefix'], o['first'], o['middle'], o['last'], o['suffix']]
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter((p) => p.length > 0)
    return parts.length > 0 ? parts.join(' ') : undefined
  }
  return undefined
}

interface ExtractedFields {
  name?: string
  email?: string
}

function extractSignerFields(
  answers: Record<string, RawJotformAnswer> | undefined,
): ExtractedFields {
  const out: ExtractedFields = {}
  for (const a of Object.values(answers ?? {})) {
    const type = (a.type ?? '').toLowerCase()
    if (type === 'control_fullname' && out.name === undefined) {
      out.name = flattenName(a.answer) ?? pickStr(a.prettyFormat)
    } else if (type === 'control_email' && out.email === undefined) {
      const v = pickStr(a.answer)
      if (v && v.includes('@')) out.email = v
    } else if (type === 'control_textbox' && out.name === undefined) {
      // Fallback: a single text field whose label looks like a name.
      const label = (a.text ?? '').toLowerCase()
      if (label.includes('name')) out.name = pickStr(a.answer)
    }
  }
  return out
}

/**
 * Jotform submissions don't expose a per-signer signing state distinct from
 * "the submission exists" — a recorded (non-deleted) submission means the
 * document was completed and signed by that party.
 */
function mapStatus(raw: RawJotformSubmission): SignerStatus {
  const status = (raw.status ?? '').toUpperCase()
  if (status === 'DELETED') return 'declined'
  return 'signed'
}

export function transformSigner(raw: RawJotformSubmission, envelopeId: string): Signer {
  const fields = extractSignerFields(raw.answers)
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId,
    email: fields.email ?? undefined,
    name: fields.name ?? '',
    role: 'signer',
    status: mapStatus(raw),
    signedAt: toIso(raw.created_at),
    platform: 'jotform-sign',
    metadata: strMap({
      submissionStatus: raw.status,
      ip: raw.ip,
      new: raw.new,
      flag: raw.flag,
      updatedAt: raw.updated_at,
    }),
    raw,
  }
}
