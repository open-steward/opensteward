import type { Deal } from '../../../schema/deal'

/**
 * Raw Daylite opportunity as returned by GET /v1/opportunities and
 * GET /v1/opportunities/:id.
 *
 * Daylite calls deals "opportunities".
 *
 * Field names are snake_case per the Daylite REST API.
 * `total` is a read-only integer representing the opportunity value in minor
 * currency units (e.g. cents for USD). There is no dedicated currency field —
 * `currency` is an extension that may appear in custom setups; default to 'USD'.
 *
 * Docs: https://developer.daylite.app/reference/opportunity.md
 */
export interface RawDayliteOpportunity {
  /** Relative resource URL, e.g. "/v1/opportunities/55" */
  self?: string
  name?: string
  /**
   * Estimate total for the Opportunity (read-only, integer minor units).
   * e.g. 5000000 represents 50 000.00 in the account currency.
   */
  total?: number
  /**
   * Optional currency code. Not a standard Daylite field; may appear in
   * custom/extended setups. Falls back to 'USD' when absent.
   */
  currency?: string
  /** 0-100 probability of closing */
  probability?: number
  /** Expected close / forecast date (ISO 8601) */
  forecasted?: string
  /** Current pipeline stage URL, e.g. "/v1/pipeline_stages/3" */
  current_pipeline_stage?: string
  /** Pipeline URL, e.g. "/v1/pipelines/1" */
  current_pipeline?: string
  /** Owner user URL */
  owner?: string
  /**
   * Contact role objects linked to this opportunity.
   * Each element may be a URL string or an object with a `contact` URL field.
   */
  contacts?: Array<string | { contact?: string; [key: string]: unknown }>
  /**
   * Company role objects linked to this opportunity.
   * Each element may be a URL string or an object with a `contact` URL field.
   */
  companies?: Array<string | { contact?: string; [key: string]: unknown }>
  /** Opportunity status/state, e.g. "open", "won", "lost", "suspended", "abandoned" */
  state?: string
  /** ISO 8601 creation timestamp (read-only) */
  create_date?: string
  /** ISO 8601 last-modified timestamp (read-only) */
  modify_date?: string
  [key: string]: unknown
}

/** Extract trailing numeric ID from a Daylite resource URL like "/v1/contacts/123". */
function extractId(url: string | undefined): string | undefined {
  if (!url) return undefined
  const match = url.match(/\/(\d+)$/)
  return match ? match[1] : undefined
}

/**
 * Extract an ID from a raw relationship entry which may be a plain URL string
 * or a role-object containing a `contact` URL field.
 */
function extractRelId(
  entry: string | { contact?: string; [key: string]: unknown } | undefined,
): string | undefined {
  if (entry == null) return undefined
  if (typeof entry === 'string') return extractId(entry)
  return extractId(entry.contact)
}

export function transformDeal(raw: RawDayliteOpportunity): Deal {
  const selfId = extractId(raw.self)
  const ownerId = extractId(raw.owner)
  const stageId = extractId(raw.current_pipeline_stage)
  const pipelineId = extractId(raw.current_pipeline)

  const contactIds = (raw.contacts ?? [])
    .map((u) => extractRelId(u))
    .filter((id): id is string => id != null)

  const companyId = extractRelId(raw.companies?.[0])

  // `total` is in integer minor units (e.g. cents). Convert to major units for
  // the canonical Money.amount field which expects a plain numeric value.
  const totalMinor = raw.total
  const hasTotal = totalMinor != null && !isNaN(totalMinor)

  return {
    id: selfId ?? String(raw['id'] ?? ''),
    title: raw.name ?? '',
    value: hasTotal
      ? { amount: Math.round(totalMinor as number), currency: raw.currency ?? 'USD' }
      : undefined,
    status: raw.state ?? undefined,
    stage_id: stageId,
    pipeline_id: pipelineId,
    owner_id: ownerId,
    probability: raw.probability != null && !isNaN(raw.probability)
      ? raw.probability
      : undefined,
    close_date: raw.forecasted ?? undefined,
    contact_ids: contactIds.length > 0 ? contactIds : undefined,
    company_id: companyId,
    created_at: raw.create_date ?? undefined,
    updated_at: raw.modify_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  // Write amount back as integer minor units
  if (data.value?.amount !== undefined) out.total = Math.round(data.value.amount)
  if (data.close_date !== undefined) out.forecasted = data.close_date
  if (data.probability !== undefined) out.probability = data.probability
  if (data.stage_id !== undefined) out.current_pipeline_stage = `/v1/pipeline_stages/${data.stage_id}`
  if (data.pipeline_id !== undefined) out.current_pipeline = `/v1/pipelines/${data.pipeline_id}`
  if (data.owner_id !== undefined) out.owner = `/v1/users/${data.owner_id}`
  if (data.status !== undefined) out.state = data.status
  return out
}
