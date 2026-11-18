/**
 * InvenTree REST API constants.
 *
 * InvenTree is a self-hosted open-source inventory management system.
 * The base URL is user-configured per instance (e.g. https://inventree.example.com).
 * All API paths are prefixed with /api/.
 * Auth: Token-based — header "Authorization: Token <TOKEN>".
 *
 * Pagination: limit/offset style (query params: limit, offset).
 * API schema version: 265+ (Django REST Framework, drf-spectacular).
 */

/** Placeholder — overridden at runtime via credentials.extra.baseUrl */
export const DEFAULT_API_BASE_URL = 'https://your-inventree-instance.example.com'

export const DEFAULT_PAGE_SIZE = 100

/**
 * InvenTree PurchaseOrder status codes.
 * Source: PurchaseOrderStatus enum in InvenTree API schema.
 */
export const PO_STATUS_CODES: Record<number, string> = {
  10: 'pending',
  20: 'placed',
  25: 'on_hold',
  30: 'complete',
  40: 'cancelled',
  50: 'lost',
  60: 'returned',
}
