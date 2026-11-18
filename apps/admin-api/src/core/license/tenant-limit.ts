/**
 * limits.tenants (D-B), enforced where tenants are created: POST /api/tenants.
 *
 * Counts every registered tenant, 'default' included. Tenant ids used on keys or
 * links without being registered are not counted (a documented limitation).
 *
 * The limit is the license's as integration-server last reported it; a stale
 * answer still counts. Before integration-server has ever answered, the community
 * limits apply (P11): never block on an unknown state, and never grant on one
 * either — community is what integration-server itself enforces without a license.
 *
 * Tenants above the limit are never removed: this only refuses the next one.
 */
import {
  COMMUNITY_ENTITLEMENTS,
  LICENSE_RENEWAL_URL,
  limitRefusal,
  type LicenseErrorBody,
} from '@opensteward/shared/licensing'
import type { AdminStore } from '../db/admin-store'
import { unavailableReason, type LicenseStatusProvider } from './status-cache'

export async function tenantLimitRefusal(
  licenseStatus: LicenseStatusProvider,
  adminStore: AdminStore,
): Promise<LicenseErrorBody | null> {
  const { snapshot, failure } = await licenseStatus.get()
  const limit = snapshot ? snapshot.status.limits.tenants : COMMUNITY_ENTITLEMENTS.limits.tenants
  const used = (await adminStore.listTenants()).length // 'default' included (D-B)
  if (used < limit) return null
  // The canonical LICENSE_LIMIT_EXCEEDED shape {code, message, limitKey, limit, used},
  // with the canonical tenant message when the license was read. A status read in
  // community mode (MISSING, INVALID, DEGRADED) says so: no license allows anything.
  const body = limitRefusal(
    'tenants',
    limit,
    used,
    snapshot?.status.entitlementSource ?? 'community',
  ).toBody()
  if (snapshot) return body
  // No license status at all: say why, and that the community limit is what refused.
  // One sentence per idea: the reason carries parentheses of its own, so it is
  // never wrapped in another pair (this is read in a console flash).
  const allows = `allows ${limit} ${limit === 1 ? 'tenant' : 'tenants'}, counting 'default', and ${used} ${used === 1 ? 'is' : 'are'} registered`
  const message = `The license could not be read from integration-server: ${unavailableReason(failure)}. Until it can be read, community limits apply: the deployment ${allows}. Existing tenants keep working. More tenants need a plan that includes them: ${LICENSE_RENEWAL_URL}`
  return { error: { ...body.error, message } }
}
