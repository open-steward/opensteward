/**
 * Shared tenant ID extraction — normalizes the different patterns used
 * across verticals (header, query param, or both).
 *
 * Checks in order:
 *   1. X-Tenant-Id header
 *   2. ?tenant_id query param
 *   3. ?tenant query param
 */
export function extractTenantId(
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, unknown>,
): string | null {
  // Header takes priority
  const headerValue = headers['x-tenant-id']
  if (typeof headerValue === 'string' && headerValue) return headerValue

  // Query params
  const tenantId = query['tenant_id']
  if (typeof tenantId === 'string' && tenantId) return tenantId

  const tenant = query['tenant']
  if (typeof tenant === 'string' && tenant) return tenant

  return null
}
