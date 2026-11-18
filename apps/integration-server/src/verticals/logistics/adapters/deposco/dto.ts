/**
 * Shapes shared by Deposco's documented response bodies, from
 * `components.schemas` of https://auth.deposco.com/public/spec?version=latest.
 */
import type { Address } from '../../schema/shared'

/**
 * `EntityRef` / `NullableEntityRef`: "Reference to another resource. … For
 * read operations, all properties are returned."
 *   id: integer (int64) — "Identifier of the resource."
 *   businessKey: object — "Collection of properties that uniquely identify the resource."
 *   href: string — "Hyperlink to access the resource."
 */
export interface DeposcoEntityRef {
  id?: number | null
  businessKey?: Record<string, unknown> | null
  href?: string | null
}

/** `Link`: `rel` "Description of the how the linked resources are related." and `href`. */
export interface DeposcoLink {
  rel?: string
  href?: string
}

/**
 * `CollectionResourceMeta` plus the `data` array of every list response.
 * Tag "Pagination": "`complete` … `true` if this is the last page of results,
 * or `false` if more pages exist"; "To retrieve the next page of results, use
 * the `href` value from the link where `rel` is `next`. When no `next` link is
 * present or `complete` is `true`, all results have been retrieved."
 */
export interface DeposcoCollection<T> {
  data?: T[] | null
  links?: DeposcoLink[] | null
  complete?: boolean | null
  pages?: number | null
}

/** The href that starts the next page, or undefined at the end of the collection. */
export function nextHref(res: DeposcoCollection<unknown>): string | undefined {
  if (res.complete === true) return undefined
  const next = (res.links ?? []).find((l) => l.rel === 'next')
  return next?.href || undefined
}

/** The resource id of an entity's `self` reference, as a string. */
export function selfId(self: DeposcoEntityRef | null | undefined): string | undefined {
  return typeof self?.id === 'number' ? String(self.id) : undefined
}

/**
 * The address fields every Deposco address DTO shares: `line1`, `line2`,
 * `city`, `stateProvince`, `postalCode`, and `country` — "Two-letter (ISO
 * 3166-1 alpha-2) country code."
 */
export interface DeposcoAddressFields {
  line1?: string | null
  line2?: string | null
  city?: string | null
  stateProvince?: string | null
  postalCode?: string | null
  country?: string | null
  [key: string]: unknown
}

const ISO_ALPHA2 = /^[A-Z]{2}$/

/** Map documented address fields plus separately sourced contact fields. Undefined when all are absent. */
export function toDeposcoAddress(
  addr: DeposcoAddressFields | null | undefined,
  contact: { name?: string | null; phone?: string | null; email?: string | null } = {},
): Address | undefined {
  const out: Address = {
    name: contact.name || undefined,
    street1: addr?.line1 || undefined,
    street2: addr?.line2 || undefined,
    city: addr?.city || undefined,
    state: addr?.stateProvince || undefined,
    postalCode: addr?.postalCode || undefined,
    country: addr?.country && ISO_ALPHA2.test(addr.country) ? addr.country : undefined,
    phone: contact.phone || undefined,
    email: contact.email || undefined,
  }
  const present = Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined))
  return Object.keys(present).length > 0 ? (present as Address) : undefined
}

/** `WeightUOM`: enum `["lb","kg","oz","g"]` — "Unit of measure for the weight." */
export type DeposcoWeightUom = 'lb' | 'kg' | 'oz' | 'g'
const WEIGHT_UOMS: readonly string[] = ['lb', 'kg', 'oz', 'g']

export function isWeightUom(u: unknown): u is DeposcoWeightUom {
  return typeof u === 'string' && WEIGHT_UOMS.includes(u)
}

/** Parse a documented `date-time` string; undefined when absent or unparseable. */
export function toDate(val: string | null | undefined): Date | undefined {
  if (!val) return undefined
  const d = new Date(val)
  return Number.isNaN(d.getTime()) ? undefined : d
}
