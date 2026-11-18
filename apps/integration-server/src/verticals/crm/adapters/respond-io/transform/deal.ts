/**
 * Respond.io ↔ canonical Deal transforms.
 *
 * Respond.io does not expose a deals/opportunities endpoint in its v2 REST
 * API. These stubs exist so the transform module is complete; the adapter
 * does not expose deal methods (the registry returns 501 automatically).
 */
import type { Deal } from '../../../schema/deal'

export interface RawRespondIoDeal {
  id: string | number
  title?: string
  contactId?: string | number
  [key: string]: unknown
}

export function transformDeal(raw: RawRespondIoDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.title ?? '',
    contact_ids: raw.contactId ? [String(raw.contactId)] : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  return out
}
