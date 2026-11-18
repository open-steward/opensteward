/**
 * Shared webhook action constants — used across all verticals.
 * Resource types are vertical-specific (invoice, shipment, etc.).
 */

export const WEBHOOK_ACTIONS = ['created', 'updated', 'deleted', 'cancelled', 'unknown'] as const
export type WebhookAction = (typeof WEBHOOK_ACTIONS)[number]
