/**
 * Shared Zod schemas for the logistics vertical.
 */
import { z } from 'zod'

export const AddressSchema = z.object({
  name: z.string().optional().meta({ example: 'Jane Doe' }),
  company: z.string().optional().meta({ example: 'Acme Industries' }),
  street1: z.string().optional().meta({ example: '2500 Market Street' }),
  street2: z.string().optional().meta({ example: 'Suite 300' }),
  city: z.string().optional().meta({ example: 'San Francisco' }),
  state: z.string().optional().meta({ example: 'CA' }),
  postalCode: z.string().optional().meta({ example: '94114' }),
  country: z.string().optional().meta({ example: 'US' }), // ISO 3166-1 alpha-2
  phone: z.string().optional().meta({ example: '+14155550123' }),
  email: z.string().optional().meta({ example: 'jane.doe@acme.example' }),
})
export type Address = z.infer<typeof AddressSchema>

export const WeightSchema = z.object({
  value: z.number().meta({ example: 2.5 }),
  unit: z.enum(['oz', 'lb', 'g', 'kg']).meta({ example: 'lb' }),
})
export type Weight = z.infer<typeof WeightSchema>

export const DimensionsSchema = z.object({
  length: z.number().meta({ example: 12 }),
  width: z.number().meta({ example: 9 }),
  height: z.number().meta({ example: 3 }),
  unit: z.enum(['in', 'cm']).meta({ example: 'in' }),
})
export type Dimensions = z.infer<typeof DimensionsSchema>

export const PackageSchema = z.object({
  id: z.string().optional().meta({ example: 'pkg_3Fh7Lm' }),
  trackingNumber: z.string().optional().meta({ example: '1Z999AA10123456784' }),
  weight: WeightSchema.optional(),
  dimensions: DimensionsSchema.optional(),
  reference: z.string().optional().meta({ example: 'acme-industries' }),
})
export type Package = z.infer<typeof PackageSchema>

export const MoneySchema = z.object({
  amount: z.number().meta({ example: 1250.0 }),
  currency: z.string().meta({ example: 'USD' }), // ISO 4217
})
export type Money = z.infer<typeof MoneySchema>

export const LineitemSchema = z.object({
  id: z.string().optional().meta({ example: 'li_5Tn8Pq' }),
  sku: z.string().optional().meta({ example: 'KB-WL-001' }),
  name: z.string().optional().meta({ example: 'Wireless Keyboard' }),
  description: z.string().optional().meta({ example: 'Compact wireless keyboard' }),
  quantity: z.number().optional().meta({ example: 25 }),
  unitAmount: z.number().optional().meta({ example: 49.99 }),
  totalAmount: z.number().optional().meta({ example: 1250.0 }),
  weight: WeightSchema.optional(),
})
export type Lineitem = z.infer<typeof LineitemSchema>

export const CarrierServiceSchema = z.object({
  code: z.string().meta({ example: 'ups_ground' }),
  name: z.string().optional().meta({ example: 'UPS Ground' }),
  transitDaysMin: z.number().int().optional().meta({ example: 2 }),
  transitDaysMax: z.number().int().optional().meta({ example: 5 }),
  isGuaranteed: z.boolean().optional().meta({ example: false }),
})
export type CarrierService = z.infer<typeof CarrierServiceSchema>
