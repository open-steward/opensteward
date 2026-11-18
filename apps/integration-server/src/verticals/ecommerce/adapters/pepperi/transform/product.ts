/**
 * Pepperi Item → canonical Product.
 *
 * Field names below (`InternalID`, `ExternalID`, `Name`, `LongDescription`,
 * `Hidden`) are confirmed against Pepperi's OWN bundled request-body
 * definitions for `POST /items`, served from
 * https://storage.pepperi.com/Developer/developer_body.js (linked from
 * https://developer.pepperi.com/api-reference/item-resources/post-items/ —
 * the interactive console populates its "Schema" tab from this file). That
 * file does not include `CreationDateTime`/`ModificationDateTime` (or any
 * date field) for Items, so this transform does not set `createdAt`/
 * `updatedAt` — a wrong field name would be worse than an absent optional
 * one. Pepperi has no separate variant/option resource — an Item IS the
 * sellable unit — so `Product.variants` is always left undefined (see the
 * adapter's `metadata.ts`: `variant` is not part of the tracked vocabulary).
 *
 * `ExternalID` is the single documented identifier this adapter uses for
 * `id` — never chained with `InternalID`. `Name` is the single documented
 * title field. Both are REQUIRED on the canonical `Product`, so a raw
 * record missing either is not translatable and `transformProduct` throws
 * rather than inventing a value (list callers should filter such records
 * out before mapping — see `index.ts`).
 */
import type { Product } from '../../../schema/product'

export interface RawPepperiItem {
  InternalID: number
  ExternalID?: string | null
  Name?: string | null
  LongDescription?: string | null
  Hidden?: boolean
  [key: string]: unknown
}

export function transformProduct(raw: RawPepperiItem): Product {
  if (!raw.ExternalID) {
    throw new Error(
      `Pepperi item ${raw.InternalID} has no ExternalID — cannot map to a canonical Product id.`,
    )
  }
  if (!raw.Name) {
    throw new Error(
      `Pepperi item ${raw.ExternalID} has no Name — cannot map to a canonical Product title.`,
    )
  }
  return {
    id: raw.ExternalID,
    title: raw.Name,
    description: raw.LongDescription ?? undefined,
    status: raw.Hidden ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}

/** Reverse mapping for `POST /items` upsert — field names as confirmed above. */
export function untransformProduct(data: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.id !== undefined) body.ExternalID = data.id
  if (data.title !== undefined) body.Name = data.title
  if (data.description !== undefined) body.LongDescription = data.description
  if (data.status !== undefined) body.Hidden = data.status === 'ARCHIVED'
  return body
}
