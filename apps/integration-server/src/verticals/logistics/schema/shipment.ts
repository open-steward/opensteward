import { z } from 'zod'
import { AddressSchema, WeightSchema, DimensionsSchema, PackageSchema, MoneySchema } from './shared'

export const ShipmentStatusSchema = z
  .enum([
    'PENDING',
    'LABEL_CREATED',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'EXCEPTION',
    'RETURNED',
    'CANCELLED',
    'UNKNOWN',
  ])
  .describe('Canonical shipment lifecycle state. Carriers map their own statuses onto these values.')

export type ShipmentStatus = z.infer<typeof ShipmentStatusSchema>

export const ShipmentModeSchema = z
  .enum(['parcel', 'ltl', 'ftl', 'ocean', 'air', 'rail', 'unknown'])
  .describe(
    'Transport mode for the shipment. Parcel adapters typically leave this unset; ocean, air, and freight adapters should populate it so consumers can filter and apply mode-specific UI.',
  )

export type ShipmentMode = z.infer<typeof ShipmentModeSchema>

export const OceanFieldsSchema = z
  .object({
    containerNumber: z.string().optional().describe('ISO 6346 container identifier.').meta({ example: 'MSCU1234567' }),
    containerType: z.string().optional().describe('Container size/type code (e.g. `40HC`, `20GP`, `45HC`).').meta({ example: '40HC' }),
    bookingNumber: z.string().optional().describe('Carrier booking reference.').meta({ example: 'BK-1042' }),
    billOfLadingNumber: z.string().optional().describe('Bill of Lading (B/L) number.').meta({ example: 'BL-1042' }),
    vesselName: z.string().optional().describe('Vessel the container is loaded on.').meta({ example: 'MV Acme Star' }),
    voyageNumber: z.string().optional().describe('Voyage code for the vessel.').meta({ example: 'V042E' }),
    shippingLine: z.string().optional().describe('Carrier / shipping line name.').meta({ example: 'Acme Ocean Line' }),
    portOfLoading: z.string().optional().describe('Origin port — UN/LOCODE preferred.').meta({ example: 'CNSHA' }),
    portOfDischarge: z.string().optional().describe('Destination port — UN/LOCODE preferred.').meta({ example: 'USLAX' }),
    estimatedDeparture: z.date().optional().describe('ETD from the port of loading.').meta({ example: '2026-01-15T09:30:00Z' }),
    estimatedArrival: z.date().optional().describe('ETA to the port of discharge.').meta({ example: '2026-02-01T14:20:00Z' }),
    actualDeparture: z.date().optional().describe('Actual departure timestamp.').meta({ example: '2026-01-15T09:30:00Z' }),
    actualArrival: z.date().optional().describe('Actual arrival timestamp.').meta({ example: '2026-02-01T14:20:00Z' }),
    sealNumber: z.string().optional().describe('Container seal identifier.').meta({ example: 'SL-998877' }),
  })
  .describe(
    'Ocean-specific shipment fields. Populated by ocean carrier and container visibility adapters. Left undefined for parcel / air / ground shipments.',
  )

export type OceanFields = z.infer<typeof OceanFieldsSchema>

export const ShipmentSchema = z
  .object({
    id: z.string().optional().describe('Platform-specific shipment identifier.').meta({ example: 'shp_1042' }),
    status: ShipmentStatusSchema.optional().meta({ example: 'IN_TRANSIT' }),
    trackingNumber: z.string().optional().describe('Carrier-issued tracking number for the shipment.').meta({ example: '1Z999AA10123456784' }),
    carrierId: z.string().optional().describe('Carrier.id the shipment is booked with.').meta({ example: 'ups' }),
    serviceCode: z.string().optional().describe('Carrier service level code (e.g. `USPS_PRIORITY`, `UPS_GROUND`).').meta({ example: 'ups_ground' }),
    warehouseId: z.string().optional().describe('Warehouse.id the shipment is dispatched from.').meta({ example: 'wh_sfo1' }),
    originAddress: AddressSchema.optional().describe('Ship-from address.'),
    destinationAddress: AddressSchema.optional().describe('Ship-to address.'),
    returnAddress: AddressSchema.optional().describe('Return address if distinct from origin.'),
    packages: z.array(PackageSchema).optional().describe('Individual packages / cartons in the shipment.'),
    totalWeight: WeightSchema.optional().describe('Sum of package weights.'),
    dimensions: DimensionsSchema.optional().describe('Overall shipment dimensions.'),
    estimatedDeliveryAt: z.date().optional().describe('ETA at the destination.').meta({ example: '2026-02-01T14:20:00Z' }),
    actualDeliveryAt: z.date().optional().describe('Actual delivery timestamp.').meta({ example: '2026-02-01T14:20:00Z' }),
    labelUrl: z.url().optional().describe('URL of the generated shipping label (PDF or PNG).').meta({ example: 'https://labels.acme.example/shp_1042.pdf' }),
    cost: MoneySchema.optional().describe('Billed or quoted cost of the shipment.'),
    reference: z.string().optional().describe('Customer-facing reference (PO number, order ID).').meta({ example: 'ORD-1042' }),
    notes: z.string().optional().describe('Free-form notes attached to the shipment.').meta({ example: 'Leave at front desk.' }),
    createdAt: z.date().optional().describe('Platform timestamp when the record was created.').meta({ example: '2026-01-15T09:30:00Z' }),
    updatedAt: z.date().optional().describe('Platform timestamp of the last modification.').meta({ example: '2026-02-01T14:20:00Z' }),
    mode: ShipmentModeSchema.optional().meta({ example: 'parcel' }),
    ocean: OceanFieldsSchema.optional(),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Complete unmodified raw platform response.'),
  })
  .describe('A parcel, freight, or ocean shipment moving from origin to destination.')

export type Shipment = z.infer<typeof ShipmentSchema>
