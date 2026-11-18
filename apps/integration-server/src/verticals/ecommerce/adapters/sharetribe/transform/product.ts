/**
 * Sharetribe listing → canonical Product / ProductVariant.
 *
 * Sharetribe listings are marketplace items (services, physical goods, rentals).
 * A listing maps naturally to a canonical Product; Sharetribe has no native
 * variant concept, so each listing is represented as a single-variant product.
 *
 * Key field notes:
 *  - `price` is already in minor units (cents) as a Money object { amount, currency }.
 *  - `state` is one of: "published", "closed", "pendingApproval", "draft".
 *  - `id` is a UUID object { uuid: string } in the raw API response.
 *  - `publicData` / `privateData` / `metadata` are arbitrary JSON objects.
 *
 * Docs: https://www.sharetribe.com/api-reference/integration.html#listings
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'

// ── Raw Sharetribe shapes ─────────────────────────────────────────────────────

/** Sharetribe UUID wrapper returned by the API. */
export interface SharetribeUUID {
  uuid: string
}

export interface SharetribeListingImage {
  id: SharetribeUUID
  type: 'image'
  attributes?: {
    variants?: Record<string, { url?: string; width?: number; height?: number }>
  }
}

export interface SharetribeListingPrice {
  amount: number
  currency: string
}

export interface RawSharetribeListing {
  id: SharetribeUUID
  type: 'listing'
  attributes: {
    title: string
    description?: string | null
    state?: string | null
    price?: SharetribeListingPrice | null
    publicData?: Record<string, unknown>
    privateData?: Record<string, unknown>
    metadata?: Record<string, unknown>
    createdAt?: string
    geolocation?: { lat?: number; lng?: number } | null
    deleted?: boolean
    availabilityPlan?: Record<string, unknown>
  }
  relationships?: {
    images?: { data?: SharetribeUUID[] }
    author?: { data?: SharetribeUUID }
    marketplace?: { data?: SharetribeUUID }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rawId(id: SharetribeUUID | null | undefined): string | undefined {
  return id?.uuid ?? undefined
}

/**
 * Map Sharetribe listing state → canonical ProductStatus.
 *   published       → ACTIVE
 *   draft           → DRAFT
 *   closed          → ARCHIVED
 *   pendingApproval → DRAFT (closest equivalent)
 */
function mapState(state: string | null | undefined): ProductStatus | undefined {
  if (!state) return undefined
  switch (state.toLowerCase()) {
    case 'published':
      return 'ACTIVE'
    case 'draft':
    case 'pendingapproval':
      return 'DRAFT'
    case 'closed':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformListing(raw: RawSharetribeListing): Product {
  const attrs = raw.attributes
  const id = rawId(raw.id) ?? String(raw.id)
  const currency = attrs.price?.currency ?? 'USD'

  // Build a single canonical variant (listings have no variant concept)
  const variant: ProductVariant = {
    id,
    productId: id,
    title: attrs.title,
    price: {
      // Sharetribe already stores amounts in minor units
      amount: attrs.price?.amount ?? 0,
      currency,
    },
    metadata: {
      ...((attrs.publicData as Record<string, unknown>) ?? {}),
      ...((attrs.privateData as Record<string, unknown>) ?? {}),
    },
  }

  return {
    id,
    title: attrs.title,
    description: attrs.description ?? undefined,
    status: mapState(attrs.state),
    variants: [variant],
    createdAt: attrs.createdAt,
    metadata: {
      state: attrs.state,
      geolocation: attrs.geolocation,
      availabilityPlan: attrs.availabilityPlan,
      publicData: attrs.publicData,
      privateData: attrs.privateData,
      metadata: attrs.metadata,
      deleted: attrs.deleted,
      authorId: rawId(raw.relationships?.author?.data),
      imageIds: raw.relationships?.images?.data?.map((img) => img.uuid) ?? [],
    } as Record<string, unknown>,
  }
}

/** Canonical Product → Sharetribe listing body for create. */
export function untransformListing(product: Partial<Product>): Record<string, unknown> {
  const price = product.variants?.[0]?.price
  const body: Record<string, unknown> = {
    title: product.title,
    description: product.description,
  }
  if (price) {
    body.price = { amount: price.amount, currency: price.currency }
  }
  if (product.status) {
    // Map canonical status back to Sharetribe state (create sets initial state)
    const stateMap: Record<string, string> = {
      ACTIVE: 'published',
      DRAFT: 'draft',
      ARCHIVED: 'closed',
    }
    body.state = stateMap[product.status] ?? 'draft'
  }
  // Pass through any publicData from metadata
  const meta = product.metadata
  if (meta?.['publicData']) {
    body.publicData = meta['publicData']
  }
  return body
}
