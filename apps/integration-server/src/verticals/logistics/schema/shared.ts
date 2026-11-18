import { z } from 'zod'
import { Amount, Iso3166Alpha2, Iso4217Currency, nullish } from '@opensteward/shared'

export const AddressSchema = z.object({
  name: z.string().optional().describe('Recipient or sender contact name.').meta({ example: 'Jane Doe' }),
  company: z.string().optional().describe('Company name.').meta({ example: 'Acme Industries' }),
  street1: z.string().optional().describe('Street address, line 1.').meta({ example: '2500 Market Street' }),
  street2: z.string().optional().describe('Street address, line 2 (unit, suite).').meta({ example: 'Suite 300' }),
  city: z.string().optional().describe('City or locality.').meta({ example: 'San Francisco' }),
  state: z.string().optional().describe('State, province, or region.').meta({ example: 'CA' }),
  postalCode: z.string().optional().describe('ZIP or postal code.').meta({ example: '94114' }),
  country: Iso3166Alpha2.optional().meta({ example: 'US' }),
  phone: z.string().optional().meta({ example: '+14155550123' }),
  email: z.email().optional().meta({ example: 'jane.doe@acme.example' }),
})

export type Address = z.infer<typeof AddressSchema>

export const WeightSchema = z.object({
  value: z.number().min(0).describe('Weight value, non-negative.').meta({ example: 1.2 }),
  unit: z.enum(['oz', 'lb', 'g', 'kg']).meta({ example: 'lb' }),
})

export type Weight = z.infer<typeof WeightSchema>

export const DimensionsSchema = z.object({
  length: z.number().min(0).meta({ example: 12 }),
  width: z.number().min(0).meta({ example: 6 }),
  height: z.number().min(0).meta({ example: 2 }),
  unit: z.enum(['in', 'cm']).meta({ example: 'in' }),
})

export type Dimensions = z.infer<typeof DimensionsSchema>

export const PackageSchema = z.object({
  id: z.string().optional().meta({ example: 'pkg_1042' }),
  trackingNumber: z.string().optional().describe('Carrier-issued tracking number.').meta({ example: '1Z999AA10123456784' }),
  weight: WeightSchema.optional(),
  dimensions: DimensionsSchema.optional(),
  reference: z.string().optional().meta({ example: 'ORD-1042' }),
})

export type Package = z.infer<typeof PackageSchema>

export const MoneySchema = z.object({
  amount: Amount.meta({ example: 1200 }),
  currency: Iso4217Currency.meta({ example: 'USD' }),
})

export type Money = z.infer<typeof MoneySchema>

export const LineitemSchema = z.object({
  id: z.string().optional().meta({ example: 'li_1042' }),
  sku: z.string().optional().describe('Stock-keeping unit.').meta({ example: 'KB-MECH-87' }),
  name: z.string().optional().meta({ example: 'Mechanical Keyboard' }),
  description: z.string().optional().meta({ example: 'Mechanical keyboard, tactile switches.' }),
  quantity: nullish(z.number().int().min(0)).meta({ example: 1 }),
  unitAmount: nullish(Amount).meta({ example: 7999 }),
  totalAmount: nullish(Amount).meta({ example: 7999 }),
  weight: WeightSchema.optional(),
})

export type Lineitem = z.infer<typeof LineitemSchema>

export const CarrierServiceSchema = z.object({
  code: z.string().describe('Carrier service-level code (e.g. `USPS_PRIORITY`).').meta({ example: 'ups_ground' }),
  name: z.string().optional().meta({ example: 'UPS Ground' }),
  transitDaysMin: z.number().int().min(0).optional().describe('Minimum transit time in days.').meta({ example: 1 }),
  transitDaysMax: z.number().int().min(0).optional().describe('Maximum transit time in days.').meta({ example: 5 }),
  isGuaranteed: z.boolean().optional().meta({ example: false }),
})

export type CarrierService = z.infer<typeof CarrierServiceSchema>
