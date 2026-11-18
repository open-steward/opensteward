import type { AdminApiClient } from './admin-api-client'

/**
 * Returns the catalog filtered to platforms the operator has actually
 * enabled — the same set surfaced by /platforms?status=enabled. Disabled
 * platforms are hidden because (a) the end-user would see them as
 * unavailable when landing on the link, and (b) a disabled platform's
 * mint succeeds but the resulting OAuth flow fails — wrong place to
 * surface that.
 *
 * One call for the enabled/hasConfig rows of every vertical, not one per
 * vertical: the fan-out this replaces cost ten upstream requests per render,
 * which is how the admin UI managed to rate-limit itself out of
 * integration-server. Verticals with zero enabled platforms drop out of the
 * picker entirely. If the rows cannot be fetched the picker renders empty
 * rather than failing the page — same degradation the per-vertical version
 * had when every vertical failed.
 */
export async function loadEnabledCatalog(
  apiClient: AdminApiClient,
  token: string,
): Promise<{ providers: Awaited<ReturnType<AdminApiClient['listCatalog']>>; verticals: string[] }> {
  const [catalog, rows] = await Promise.all([
    apiClient.listCatalog(token),
    apiClient.listAllPlatformRows(token).catch(() => []),
  ])
  const enabledKeys = new Set<string>()
  for (const row of rows) {
    if (row.enabled && row.vertical) enabledKeys.add(`${row.vertical}/${row.slug}`)
  }
  const providers = catalog.filter((p) => enabledKeys.has(`${p.vertical}/${p.slug}`))
  const verticals = Array.from(new Set(providers.map((p) => p.vertical))).sort()
  return { providers, verticals }
}
