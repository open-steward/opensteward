import type { Deal } from '../../../schema/deal'

/**
 * Vitally does not have a native Deal/Opportunity entity.
 * Conversations are the closest analogue — they are account-scoped discussions.
 * Docs: https://docs.vitally.io/en/articles/9880665-rest-api-conversations
 *
 * We map conversations to deals as a best-effort:
 *   id        ← conversation id
 *   title     ← subject
 *   status    ← status (open/closed)
 *   company_id← accounts[0].id (if present)
 */
export interface RawVitallyConversation {
  id: string
  externalId?: string | null
  subject?: string | null
  status?: string | null
  rating?: string | null
  accounts?: Array<{ id: string; name?: string }>
  users?: Array<{ id: string }>
  admins?: Array<{ id: string }>
  traits?: Record<string, unknown>
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformDeal(raw: RawVitallyConversation): Deal {
  const companyId =
    Array.isArray(raw.accounts) && raw.accounts.length > 0
      ? String(raw.accounts[0].id)
      : undefined

  return {
    id: String(raw.id),
    title: typeof raw.subject === 'string' && raw.subject ? raw.subject : '(no subject)',
    status: typeof raw.status === 'string' ? raw.status : undefined,
    company_id: companyId,
    created_at: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    updated_at: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.subject = data.title
  return out
}
