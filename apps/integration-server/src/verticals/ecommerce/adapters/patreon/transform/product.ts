/**
 * Patreon Campaign → canonical Product.
 *
 * Patreon campaigns map naturally to products:
 *  - Campaign = the creator's page/offering → Product
 *  - Campaign tiers (benefits) could be variants, but Patreon's API
 *    exposes tiers as separate resources linked via relationships.
 *    We include tiers as variants when they are present in `_included`.
 *
 * JSON:API responses are pre-flattened by the client (id + attributes
 * at top level, relationships under `_relationships`).
 *
 * Canonical `Product.id` = Patreon campaign id (numeric, stringified).
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import type { FlatResource } from '../client'

// ── Raw Patreon shapes (post-flatten) ─────────────────────────────────────────

export interface RawPatreonCampaign {
  id: string
  created_at?: string
  creation_name?: string
  discord_server_id?: string
  image_small_url?: string
  image_url?: string
  is_charged_immediately?: boolean
  is_monthly?: boolean
  is_nsfw?: boolean
  main_video_embed?: string | null
  main_video_url?: string | null
  one_liner?: string | null
  patron_count?: number
  pay_per_name?: string | null
  pledge_url?: string
  published_at?: string | null
  summary?: string | null
  thanks_embed?: string | null
  thanks_msg?: string | null
  thanks_video_url?: string | null
  url?: string
  vanity?: string | null
  _type?: string
  _relationships?: Record<string, unknown>
  _included?: FlatResource[]
  [key: string]: unknown
}

export interface RawPatreonTier {
  id: string
  amount_cents?: number
  created_at?: string
  description?: string
  discord_role_ids?: string[] | null
  edited_at?: string
  image_url?: string | null
  patron_count?: number
  post_count?: number
  published?: boolean
  published_at?: string | null
  title?: string
  unpublished_at?: string | null
  url?: string
  _type?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(raw: RawPatreonCampaign): ProductStatus {
  if (raw.published_at) return 'ACTIVE'
  return 'DRAFT'
}

function mapImages(raw: RawPatreonCampaign): Image[] {
  const images: Image[] = []
  if (raw.image_url) {
    images.push({ url: raw.image_url, position: 0 })
  }
  if (raw.image_small_url && raw.image_small_url !== raw.image_url) {
    images.push({ url: raw.image_small_url, alt: 'thumbnail', position: 1 })
  }
  return images
}

function extractTiers(raw: RawPatreonCampaign): RawPatreonTier[] {
  const included = raw._included ?? []
  return included.filter((r) => r._type === 'tier') as unknown as RawPatreonTier[]
}

// ── Tier → ProductVariant ────────────────────────────────────────────────────

export function transformTier(tier: RawPatreonTier, campaignId: string): ProductVariant {
  const amountCents = tier.amount_cents ?? 0
  return {
    id: tier.id,
    productId: campaignId,
    title: tier.title,
    price: { amount: amountCents / 100, currency: 'USD' },
    metadata: {
      ...(tier as Record<string, unknown>),
      campaignId,
    },
  }
}

// ── Campaign → Product ───────────────────────────────────────────────────────

export function transformProduct(raw: RawPatreonCampaign): Product {
  const images = mapImages(raw)
  const tiers = extractTiers(raw)
  const variants = tiers.length > 0
    ? tiers.map((t) => transformTier(t, raw.id))
    : undefined

  return {
    id: raw.id,
    title: raw.creation_name ?? raw.vanity ?? '',
    description: raw.summary ?? undefined,
    handle: raw.vanity ?? undefined,
    status: mapStatus(raw),
    productType: 'campaign',
    tags: raw.is_nsfw ? ['nsfw'] : undefined,
    variants,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created_at,
    publishedAt: raw.published_at ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (for create — Patreon campaigns are mostly read-only) ────────

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    data: {
      type: 'campaign',
      attributes: {
        creation_name: product.title,
        summary: product.description,
      },
    },
  }
}
