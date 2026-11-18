import type { preHandlerAsyncHookHandler } from 'fastify'
import { featureRefusal, type EntitlementService } from '@opensteward/shared/licensing'

export interface EntitlementSource {
  entitlements(): EntitlementService
}

/**
 * The `licenseGate` each vertical plugin adds AFTER its authMiddleware, so it
 * covers /v1, /v1/me and /test/v1, and an unauthenticated caller gets 401
 * before learning anything from a 403. Entitlements are read per request: a
 * renewal or a lapse applies without a restart.
 */
export function createVerticalLicenseGate(
  license: EntitlementSource,
): (vertical: string) => preHandlerAsyncHookHandler {
  return (vertical) => {
    const feature = `vertical:${vertical}`
    return async function verticalLicenseGate(_request, reply) {
      const entitlements = license.entitlements()
      if (entitlements.has(feature)) return
      await reply.status(403).send(featureRefusal(entitlements.status(), feature).toBody())
    }
  }
}
