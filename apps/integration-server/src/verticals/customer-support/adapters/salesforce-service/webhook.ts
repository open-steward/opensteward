/**
 * Salesforce Service Cloud webhook handling.
 *
 * **Salesforce push deliveries cannot be authenticated here, so this verifier
 * rejects every delivery (fail closed).**
 *
 * What Salesforce documents for pushing record changes to an HTTP endpoint,
 * read on 2026-09-28:
 *
 * 1. Outbound Messages (SOAP, sent by a workflow rule / Flow action).
 *    "Considerations for Security"
 *    https://developer.salesforce.com/docs/platform/api/guide/sforce-api-om-outboundmessaging-security.html
 *    lists four measures, and none of them is a payload signature:
 *    - Restrict the listener to Salesforce IP ranges. The page itself says this
 *      "doesn't guarantee that another customer isn't pointing to your endpoint
 *      and sending messages", so any Salesforce org can reach us.
 *    - Use SSL/TLS. Confidentiality only; Salesforce authenticates *our*
 *      certificate, not the other way round.
 *    - Validate "the identity of the Salesforce server when it takes the role
 *      of a client to your server, using the Salesforce client certificate"
 *      (two-way TLS; download steps in
 *      https://developer.salesforce.com/docs/platform/api/guide/sforce-api-om-outboundmessaging-setting-up.html).
 *      That check lives in the TLS handshake. `verifyWebhook` receives only
 *      `(rawBody, headers, secret)` after TLS has been terminated, so it has
 *      nothing to check it against.
 *    - "The organization Id is included in each message ... validate that
 *      messages contain your organization Id." `OrganizationId` is a field of
 *      the SOAP body (see the WSDL page,
 *      https://developer.salesforce.com/docs/platform/api/guide/sforce-api-om-outboundmessaging-wsdl.html).
 *      The sender writes it, an org id is an identifier and not a secret, and
 *      anyone who knows it can put it in a forged body. It is not
 *      authentication, and this file does not treat it as such.
 *    The optional `SessionId` element is "used by the receiving code to make
 *    calls back to Salesforce"; it is not documented as a verification
 *    mechanism, and a synchronous boolean verifier cannot make that call.
 *
 * 2. Pub/Sub API (platform events, Change Data Capture). The subscriber opens
 *    a gRPC stream to Salesforce
 *    (https://developer.salesforce.com/docs/platform/pub-sub-api/guide/intro.html);
 *    it pulls, nothing is pushed to this route, so there is nothing to verify.
 *
 * 3. Flow HTTP Callout actions send whatever request the flow author builds,
 *    authenticated through Named/External Credentials, whose custom headers
 *    are chosen by the admin. Salesforce defines no header name, no signature
 *    and no signed bytes for it, so there is no vendor scheme to implement.
 *
 * 4. Data 360 (Data Cloud) "Webhook Data Action Targets" *are* signed:
 *    HMAC-SHA256 with a Salesforce-generated secret, base64, in `x-signature`
 *    (https://developer.salesforce.com/docs/data/data-cloud-int/references/webhook-data-action-targets/c360a-api-payload-signature.html,
 *    .../c360a-api-validating-the-signature.html). That is a different,
 *    separately licensed product: a data action fires on Data 360 data model
 *    objects or calculated insights and sends `DataObjectDataChgEvent`
 *    payloads, not Service Cloud Case/CaseComment changes from the org this
 *    adapter connects to. Its signed bytes are also not pinned: the page says
 *    to "perform JSON escaping on the payload received at the target" without
 *    defining that transform, and it publishes no test vector. It is not
 *    implemented here; see the README.
 *
 * Salesforce documents no signed push for Service Cloud records themselves.
 *
 * Separately, even an authentic Outbound Message could not be accepted by the
 * unified route: it is a `text/xml` SOAP envelope, the route only registers an
 * `application/json` body parser, and it answers `{ received: true }` rather
 * than the SOAP `notificationsResponse` with `Ack` = true that Salesforce
 * waits for (it retries unacknowledged messages for up to 24 hours).
 *
 * Until this rewrite the file checked an `X-Salesforce-Signature` HMAC that no
 * Salesforce document describes; it was copied from the Zendesk adapter.
 * Accepting everything instead would let any Salesforce org (or anyone) post
 * forged Case events. Rejecting is a missing feature, stated in the README.
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

export function verifySalesforceServiceWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // No application-layer mechanism exists to authenticate a Salesforce push
  // of Service Cloud record changes. See the file header.
  return false
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined
}

/**
 * Maps the documented `notifications` element (WSDL page above):
 * `OrganizationId`, `ActionId` (the workflow rule that fired), `SessionId`,
 * `EnterpriseUrl`, `PartnerUrl`, and up to 100 `Notification` entries, each
 * `{ Id, sObject }` where `sObject` carries the selected fields plus its `Id`.
 * The notification `Id` is the documented redelivery key ("check the
 * notification IDs ... before processing").
 *
 * It only runs after `verifyWebhook` passes, which today is never; it exists so
 * a future edge-terminated setup has a mapping instead of Zendesk shapes. An
 * Outbound Message says nothing about what happened to the record (the rule
 * decides when it fires) and the sObject type is fixed per message definition,
 * not named in these elements, so resource type and action stay `unknown`.
 */
export function parseSalesforceServiceWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const envelope = asRecord(payload['notifications']) ?? payload
  const actionId = envelope['ActionId'] == null ? '' : String(envelope['ActionId'])
  const raw = envelope['Notification']
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
  const events: WebhookEvent[] = []
  for (const entry of list) {
    const n = asRecord(entry)
    if (!n) continue
    const sObject = asRecord(n['sObject']) ?? {}
    const resourceId = sObject['Id'] == null ? '' : String(sObject['Id'])
    const notificationId = n['Id'] == null ? undefined : String(n['Id'])
    events.push({
      id: notificationId ?? `salesforce-service:${actionId}:${resourceId}`,
      platform: 'salesforce-service',
      type: actionId,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload: n,
    })
  }
  return events
}

export const SalesforceServiceWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySalesforceServiceWebhook,
  parseWebhookEvents: parseSalesforceServiceWebhookEvents,
}
