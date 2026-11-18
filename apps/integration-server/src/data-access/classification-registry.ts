/**
 * Every vertical's field classification and canonical schema, keyed by the
 * resource types the sync worker stores (`<v>/sync/listable-resources.ts`).
 *
 * This is the link between a stored row (vertical + resource_type) and what a
 * reader may see of it. `scripts/check-field-classification.ts` keeps it
 * complete: a listable resource with no entry fails the build.
 */
import type { ResourceClassification } from '@opensteward/shared'
import * as accounting from '../verticals/accounting/schema/classification'
import * as crm from '../verticals/crm/schema/classification'
import * as ecommerce from '../verticals/ecommerce/schema/classification'
import * as logistics from '../verticals/logistics/schema/classification'
import * as payments from '../verticals/payments/schema/classification'
import * as docsign from '../verticals/docsign/schema/classification'
import * as projects from '../verticals/projects/schema/classification'
import * as customerSupport from '../verticals/customer-support/schema/classification'
import * as inventory from '../verticals/inventory/schema/classification'
import { LISTABLE_RESOURCES as ACCOUNTING_LISTABLES } from '../verticals/accounting/sync/listable-resources'
import { LISTABLE_RESOURCES as CRM_LISTABLES } from '../verticals/crm/sync/listable-resources'
import { LISTABLE_RESOURCES as ECOMMERCE_LISTABLES } from '../verticals/ecommerce/sync/listable-resources'
import { LISTABLE_RESOURCES as LOGISTICS_LISTABLES } from '../verticals/logistics/sync/listable-resources'
import { LISTABLE_RESOURCES as PAYMENTS_LISTABLES } from '../verticals/payments/sync/listable-resources'
import { LISTABLE_RESOURCES as DOCSIGN_LISTABLES } from '../verticals/docsign/sync/listable-resources'
import { LISTABLE_RESOURCES as PROJECTS_LISTABLES } from '../verticals/projects/sync/listable-resources'
import { LISTABLE_RESOURCES as CS_LISTABLES } from '../verticals/customer-support/sync/listable-resources'
import { LISTABLE_RESOURCES as INV_LISTABLES } from '../verticals/inventory/sync/listable-resources'

/** The part of a Zod object schema the registry reads: its top-level shape. */
export interface ShapedSchema {
  shape: Record<string, unknown>
}

interface VerticalEntry {
  classification: Record<string, ResourceClassification>
  schemas: Record<string, ShapedSchema>
  listable: ReadonlyArray<{ resourceType: string }>
}

export const VERTICAL_CLASSIFICATIONS: Readonly<Record<string, VerticalEntry>> = {
  accounting: {
    classification: accounting.CLASSIFICATION,
    schemas: accounting.RESOURCE_SCHEMAS,
    listable: ACCOUNTING_LISTABLES,
  },
  crm: {
    classification: crm.CLASSIFICATION,
    schemas: crm.RESOURCE_SCHEMAS,
    listable: CRM_LISTABLES,
  },
  ecommerce: {
    classification: ecommerce.CLASSIFICATION,
    schemas: ecommerce.RESOURCE_SCHEMAS,
    listable: ECOMMERCE_LISTABLES,
  },
  logistics: {
    classification: logistics.CLASSIFICATION,
    schemas: logistics.RESOURCE_SCHEMAS,
    listable: LOGISTICS_LISTABLES,
  },
  payments: {
    classification: payments.CLASSIFICATION,
    schemas: payments.RESOURCE_SCHEMAS,
    listable: PAYMENTS_LISTABLES,
  },
  docsign: {
    classification: docsign.CLASSIFICATION,
    schemas: docsign.RESOURCE_SCHEMAS,
    listable: DOCSIGN_LISTABLES,
  },
  projects: {
    classification: projects.CLASSIFICATION,
    schemas: projects.RESOURCE_SCHEMAS,
    listable: PROJECTS_LISTABLES,
  },
  'customer-support': {
    classification: customerSupport.CLASSIFICATION,
    schemas: customerSupport.RESOURCE_SCHEMAS,
    listable: CS_LISTABLES,
  },
  inventory: {
    classification: inventory.CLASSIFICATION,
    schemas: inventory.RESOURCE_SCHEMAS,
    listable: INV_LISTABLES,
  },
}

/**
 * Fallback for a stored type with no sidecar entry (a resource cached by a
 * read-through route but never listed by the sync worker): everything is
 * treated as PII, so the viewer fails closed rather than open.
 */
export const UNCLASSIFIED: ResourceClassification = { '*': { class: 'pii', mask: 'redact' } }

/** The classification for a stored (vertical, resourceType), or null if none exists. */
export function getClassification(
  vertical: string,
  resourceType: string,
): ResourceClassification | null {
  const v = VERTICAL_CLASSIFICATIONS[vertical]
  if (!v || !Object.hasOwn(v.classification, resourceType)) return null
  return v.classification[resourceType]!
}

/** The canonical schema for a stored (vertical, resourceType), or null. */
export function getResourceSchema(vertical: string, resourceType: string): ShapedSchema | null {
  const v = VERTICAL_CLASSIFICATIONS[vertical]
  if (!v || !Object.hasOwn(v.schemas, resourceType)) return null
  return v.schemas[resourceType]!
}

/** Every listable (vertical, resourceType) pair. */
export function listableResources(): Array<{ vertical: string; resourceType: string }> {
  return Object.entries(VERTICAL_CLASSIFICATIONS).flatMap(([vertical, v]) =>
    v.listable.map((r) => ({ vertical, resourceType: r.resourceType })),
  )
}
