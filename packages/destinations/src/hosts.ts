/**
 * SSRF guard for destination hosts.
 *
 * A destination is an operator-supplied host this service dials with its own
 * network position, so an S3 endpoint of `http://169.254.169.254` or a
 * Postgres host of `10.0.0.5` would turn the export worker into a probe of
 * the internal network. Every host a destination names is resolved and
 * refused when any address is private (`assertPublicHost`) — at create/update
 * AND again each time a sink is built, since DNS can change in between.
 *
 * Self-hosted deployments legitimately export to private hosts (MinIO next
 * to the stack, a Postgres on the LAN), so an explicit allow-list of host
 * names skips the check: `DESTINATIONS_ALLOW_PRIVATE_HOSTS=minio,db.internal`.
 * Hosts on public cloud endpoints the SDK builds itself (AWS, GCS, Azure,
 * BigQuery) are not operator-controlled and are not checked. A Snowflake
 * account host (`<account>.snowflakecomputing.com`, or the `host`
 * override), a Databricks workspace host and an Iceberg catalog URL are.
 */
import { assertPublicHost } from '@opensteward/shared'
import { snowflakeHost } from './loaders/snowflake'
import type { HostGuard } from './types'

/** Parse a comma-separated allow-list; lower-cased, blanks dropped. */
export function parseHostAllowList(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

function bareHost(host: string): string {
  // `[::1]` → `::1`, as URL.hostname renders IPv6 literals.
  return host.replace(/^\[(.*)\]$/, '$1').toLowerCase()
}

/**
 * A guard that allows the listed hosts and otherwise requires every resolved
 * address to be public. `allowList` may be a function so a runtime setting
 * can change it without a restart.
 */
export function createHostGuard(allowList: string[] | (() => string[]) = []): HostGuard {
  return async (host: string) => {
    const h = bareHost(host)
    const allowed = typeof allowList === 'function' ? allowList() : allowList
    if (allowed.map(bareHost).includes(h)) return
    await assertPublicHost(h)
  }
}

/** The operator-controlled hosts a destination's config names. */
export function destinationHosts(type: string, config: Record<string, unknown>): string[] {
  const urlHost = (v: unknown): string[] => {
    if (typeof v !== 'string' || v === '') return []
    try {
      return [new URL(v).hostname]
    } catch {
      return []
    }
  }
  switch (type) {
    case 's3':
      return urlHost(config['endpoint'])
    case 'gcs':
      return urlHost(config['apiEndpoint'])
    case 'azure_blob':
      return urlHost(config['endpoint'])
    case 'postgres':
    case 'databricks':
      return typeof config['host'] === 'string' ? [config['host']] : []
    case 'snowflake':
      return typeof config['account'] === 'string'
        ? [
            snowflakeHost({
              account: config['account'],
              host: typeof config['host'] === 'string' ? config['host'] : undefined,
            }),
          ]
        : []
    case 'iceberg': {
      const storage = (config['storage'] ?? {}) as Record<string, unknown>
      return [...urlHost(config['catalogUri']), ...urlHost(storage['endpoint'])]
    }
    default:
      return []
  }
}

/** Run the guard over every host a destination names. */
export async function assertDestinationHosts(
  guard: HostGuard,
  type: string,
  config: Record<string, unknown>,
): Promise<void> {
  for (const host of destinationHosts(type, config)) await guard(host)
}
