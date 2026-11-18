import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'
import { UnitOfMeasureSchema, MoneySchema } from './shared'

export const ProductSchema = z.object({
  id: z.string().meta({ example: 'item_wk2026' }),
  externalId: z.string().meta({ example: 'item_wk2026' }),
  sku: z.string().meta({ example: 'WK-2026' }),
  name: z.string().meta({ example: 'Wireless Keyboard' }),
  description: z.string().optional().meta({ example: 'Bluetooth wireless keyboard, US layout.' }),
  upc: z.string().optional().meta({ example: '0123456789012' }),
  isbn: z.string().optional().meta({ example: '9780000000000' }),
  brand: z.string().optional().meta({ example: 'Keyboards Inc' }),
  category: z.string().optional().meta({ example: 'Peripherals' }),
  unitOfMeasure: UnitOfMeasureSchema.optional().meta({ example: 'each' }),
  weightGrams: z.number().optional().meta({ example: 450 }),
  dimensionsCm: z.object({
    length: z.number().optional().meta({ example: 44 }),
    width: z.number().optional().meta({ example: 13 }),
    height: z.number().optional().meta({ example: 3 }),
  }).optional(),
  cost: MoneySchema.optional(),
  retailPrice: MoneySchema.optional(),
  isActive: z.boolean().meta({ example: true }),
  isTrackingEnabled: z.boolean().optional().meta({ example: true }),
  parentProductId: z.string().optional().describe(
    'For variants: parent product id. Master products have parentProductId: undefined.',
  ).meta({ example: 'item_wk2026' }),
  supplierIds: z.array(z.string().meta({ example: 'sup_1042' })),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  platform: z.string().meta({ example: 'cin7' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Product = z.infer<typeof ProductSchema>
