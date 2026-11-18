import { z } from 'zod'
import { IsoDatetime, Slug, withUnknown } from '@opensteward/shared'
import { ImageSchema } from './shared'

export const CollectionTypeSchema = withUnknown(['MANUAL', 'SMART'])
export type CollectionType = z.infer<typeof CollectionTypeSchema>

export const CollectionSchema = z.object({
  id: z.string().meta({ example: 'col_accessories' }),
  title: z.string().meta({ example: 'Accessories' }),
  handle: Slug.optional().meta({ example: 'accessories' }),
  description: z.string().optional().meta({ example: 'Keyboards, mice, and other desk accessories.' }),
  type: CollectionTypeSchema.optional().meta({ example: 'MANUAL' }),
  productIds: z.array(z.string()).optional().meta({ example: ['prod_wk2026'] }),
  image: ImageSchema.optional(),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  publishedAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  metadata: z.record(z.string(), z.unknown()).meta({ example: { collectionPlatformId: 'gid://shopify/Collection/col_accessories' } }),
})
export type Collection = z.infer<typeof CollectionSchema>
