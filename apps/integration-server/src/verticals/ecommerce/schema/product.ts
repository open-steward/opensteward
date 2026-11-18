import { z } from 'zod'
import { IsoDatetime, Slug } from '@opensteward/shared'
import { MoneySchema, ImageSchema } from './shared'

export const ProductStatusSchema = z
  .enum(['ACTIVE', 'ARCHIVED', 'DRAFT'])
  .describe('Storefront visibility state.')
export type ProductStatus = z.infer<typeof ProductStatusSchema>

export const WeightUnitSchema = z
  .enum(['g', 'kg', 'oz', 'lb'])
  .describe('Unit of measure for product / variant weight.')
export type WeightUnit = z.infer<typeof WeightUnitSchema>

export const ProductOptionSchema = z
  .object({
    id: z.string().optional().describe('Platform-specific option identifier.').meta({ example: 'opt_wk2026_color' }),
    name: z.string().describe('Option label shown to shoppers (e.g. `Size`, `Color`).').meta({ example: 'Color' }),
    values: z.array(z.string()).describe('Allowed values for this option (e.g. `["S", "M", "L"]`).').meta({ example: ['Black'] }),
    position: z.number().int().min(0).optional().describe('Display order, 0-indexed.').meta({ example: 0 }),
  })
  .describe('A product option (e.g. "Size" or "Color"). Combines with sibling options to form variant `optionValues` maps.')
export type ProductOption = z.infer<typeof ProductOptionSchema>

export const ProductVariantSchema = z
  .object({
    id: z.string().describe('Platform-specific variant identifier.').meta({ example: 'var_wk2026_blk' }),
    productId: z.string().optional().describe('Parent Product.id.').meta({ example: 'prod_wk2026' }),
    sku: z.string().optional().describe('Stock-keeping unit.').meta({ example: 'WK-2026' }),
    barcode: z.string().optional().describe('Barcode (UPC, EAN, ISBN).').meta({ example: '0123456789012' }),
    title: z.string().optional().describe('Variant title, typically a concatenation of option values.').meta({ example: 'Black' }),
    price: MoneySchema.describe('Selling price.'),
    compareAtPrice: MoneySchema.optional().describe('Original / compare-at price for strikethrough display.'),
    weight: z.number().min(0).optional().describe('Weight in `weightUnit` (defaults to grams per Shopify convention).').meta({ example: 850 }),
    weightUnit: WeightUnitSchema.optional().meta({ example: 'g' }),
    inventoryItemId: z.string().optional().describe('Shopify-style link from a variant to its inventory item.').meta({ example: 'invitem_wk2026_blk' }),
    optionValues: z
      .record(z.string(), z.string())
      .optional()
      .describe('Map of option name → selected value, e.g. `{ color: "red", size: "M" }`.')
      .meta({ example: { Color: 'Black' } }),
    taxable: z.boolean().optional().describe('Whether taxes apply at checkout.').meta({ example: true }),
    requiresShipping: z.boolean().optional().describe('`false` for digital goods.').meta({ example: true }),
    position: z.number().int().min(0).optional().describe('Display order within the product, 0-indexed.').meta({ example: 0 }),
    metadata: z
      .record(z.string(), z.unknown())
      .describe('Complete unmodified raw platform response.')
      .meta({ example: { variantPlatformId: 'gid://shopify/ProductVariant/var_wk2026_blk' } }),
  })
  .describe('A purchasable SKU belonging to a product. First-class so it can be listed, fetched, and mutated directly.')
export type ProductVariant = z.infer<typeof ProductVariantSchema>

export const ProductSchema = z
  .object({
    id: z.string().describe('Platform-specific product identifier.').meta({ example: 'prod_wk2026' }),
    title: z.string().describe('Product name shown to shoppers.').meta({ example: 'Wireless Keyboard' }),
    description: z.string().optional().describe('HTML-capable description body.').meta({ example: '<p>A compact wireless keyboard.</p>' }),
    handle: Slug.optional().describe('URL slug (e.g. `red-t-shirt`).').meta({ example: 'wireless-keyboard' }),
    status: ProductStatusSchema.optional().meta({ example: 'ACTIVE' }),
    vendor: z.string().optional().describe('Brand or supplier.').meta({ example: 'Acme Industries' }),
    productType: z.string().optional().describe('Merchandise category / type.').meta({ example: 'Accessories' }),
    tags: z.array(z.string()).optional().describe('Free-form labels.').meta({ example: ['accessories'] }),
    options: z.array(ProductOptionSchema).optional().describe('Configurable options (e.g. size, color).'),
    variants: z.array(ProductVariantSchema).optional().describe('Purchasable SKUs generated from the option matrix.'),
    images: z.array(ImageSchema).optional().describe('Product imagery.'),
    createdAt: IsoDatetime.optional().describe('ISO 8601 timestamp when the product was created.').meta({ example: '2026-01-15T09:30:00Z' }),
    updatedAt: IsoDatetime.optional().describe('ISO 8601 timestamp of the last modification.').meta({ example: '2026-02-01T14:20:00Z' }),
    publishedAt: IsoDatetime.optional().describe('ISO 8601 timestamp when the product went live.').meta({ example: '2026-01-15T09:30:00Z' }),
    metadata: z
      .record(z.string(), z.unknown())
      .describe('Complete unmodified raw platform response.')
      .meta({ example: { productPlatformId: 'gid://shopify/Product/prod_wk2026' } }),
  })
  .describe('A catalog product with one or more purchasable variants.')
export type Product = z.infer<typeof ProductSchema>
