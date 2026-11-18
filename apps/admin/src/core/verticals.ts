/**
 * The verticals this admin surfaces — declared once.
 *
 * Single source of truth — hand-maintained copies of this list (in routes,
 * proxies, or inline view JS) drift and desynchronise the UI from what the
 * server mints.
 *
 * Import from here. Do not re-list.
 */
export const KNOWN_VERTICALS = [
  'accounting',
  'crm',
  'ecommerce',
  'logistics',
  'payments',
  'docsign',
  'projects',
  'customer-support',
  'inventory',
] as const

export type VerticalName = (typeof KNOWN_VERTICALS)[number]

/** Display names for the UI. Keys mirror KNOWN_VERTICALS exactly. */
export const VERTICAL_LABELS: Record<VerticalName, string> = {
  accounting: 'Accounting',
  crm: 'CRM',
  ecommerce: 'Ecommerce',
  logistics: 'Logistics',
  payments: 'Payments',
  docsign: 'Docsign',
  projects: 'Projects',
  'customer-support': 'Customer Support',
  inventory: 'Inventory',
}

export function isKnownVertical(value: string): value is VerticalName {
  return (KNOWN_VERTICALS as readonly string[]).includes(value)
}
