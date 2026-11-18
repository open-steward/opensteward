import type { Company } from '../../../schema/company'

/**
 * An Affinity v2 Company ("Company model"), as GET /v2/companies and
 * GET /v2/companies/{companyId} return it. Required: id, name, domain,
 * domains, isGlobal. https://developer.affinity.co/api-reference/openapi.json
 */
export interface RawAffinityCompany {
  /** "The company's unique identifier" */
  id: number
  /** "The company's name" */
  name: string
  /** "The company's primary domain" (string or null) */
  domain: string | null
  /** "All of the company's domains" */
  domains: string[]
  /** "Whether or not the company is tenant specific" */
  isGlobal: boolean
  fields?: unknown[]
  [key: string]: unknown
}

export function transformCompany(raw: RawAffinityCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name,
    ...(raw.domain ? { domain: raw.domain } : {}),
    metadata: raw,
  }
}

/** Write-path body (createCompany / updateCompany). Unchanged by the v2 read rebuild. */
export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.domains = [data.domain]
  return out
}
