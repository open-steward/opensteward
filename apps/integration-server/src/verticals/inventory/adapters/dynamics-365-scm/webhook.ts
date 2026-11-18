/**
 * Dynamics 365 SCM — webhook stub.
 *
 * D365 SCM does not expose a documented HMAC or JWT-signed webhook mechanism
 * for inventory events.  Event-driven integration is delivered via:
 *   • Microsoft Dataverse / Power Automate flow triggers
 *   • Azure Event Grid / Service Bus via the D365 "Business Events" framework
 *   • D365 Data Management Framework export jobs
 *
 * The Business Events framework delivers a JWT signed by the D365 environment's
 * Azure AD tenant, but the verification algorithm and header names are not part
 * of a stable public contract that can be implemented here.
 *
 * verifyWebhook: always returns false (reject unverified payloads).
 * parseWebhookEvents: returns an empty array (unsupported).
 *
 * If your D365 environment is configured to forward Business Events to an
 * external endpoint with a shared secret, set the secret and override this
 * module with a HMAC-SHA256 verifier matching your specific event endpoint
 * configuration.
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

export function verifyDynamics365ScmWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
  return false
}

export function parseDynamics365ScmWebhookEvents(_payload: Record<string, unknown>): WebhookEvent[] {
  return []
}

export const Dynamics365ScmWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyDynamics365ScmWebhook,
  parseWebhookEvents: parseDynamics365ScmWebhookEvents,
}
