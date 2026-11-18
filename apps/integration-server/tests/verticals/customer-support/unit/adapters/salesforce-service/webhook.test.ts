/**
 * Salesforce documents no payload signature for push deliveries. Outbound
 * Messages are protected only by IP ranges, TLS, an optional client
 * certificate (checked in the TLS handshake) and an OrganizationId that the
 * sender writes into the body:
 * https://developer.salesforce.com/docs/platform/api/guide/sforce-api-om-outboundmessaging-security.html
 * So the verifier must reject every delivery, however plausible it looks.
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifySalesforceServiceWebhook,
  parseSalesforceServiceWebhookEvents,
  SalesforceServiceWebhookHandler,
} from '../../../../../../src/verticals/customer-support/adapters/salesforce-service/webhook'
import { WebhookEventSchema } from '../../../../../../src/verticals/customer-support/schema/webhook'

const ORG_ID = '00D000000000062EAA'
const SECRET = 'configured-webhook-secret'

// Shape from the documented notifications() WSDL: OrganizationId, ActionId,
// SessionId, EnterpriseUrl, PartnerUrl, Notification { Id, sObject }.
const SOAP = Buffer.from(
  `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
 <soapenv:Body>
  <notifications xmlns="http://soap.sforce.com/2005/09/outbound">
   <OrganizationId>${ORG_ID}</OrganizationId>
   <ActionId>04k000000000001AAA</ActionId>
   <SessionId xsi:nil="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
   <EnterpriseUrl>https://example.my.salesforce.com/services/Soap/c/60.0/${ORG_ID}</EnterpriseUrl>
   <PartnerUrl>https://example.my.salesforce.com/services/Soap/u/60.0/${ORG_ID}</PartnerUrl>
   <Notification>
    <Id>04l000000000001AAA</Id>
    <sObject xsi:type="sf:Case" xmlns:sf="urn:sobject.enterprise.soap.sforce.com" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
     <sf:Id>500000000000001AAA</sf:Id>
    </sObject>
   </Notification>
  </notifications>
 </soapenv:Body>
</soapenv:Envelope>`,
)

const JSON_BODY = Buffer.from(JSON.stringify({ OrganizationId: ORG_ID, Notification: [] }))

describe('verifySalesforceServiceWebhook (fail closed)', () => {
  it('rejects a genuine-looking Outbound Message carrying the right OrganizationId', () => {
    const headers = { 'content-type': 'text/xml; charset=utf-8', soapaction: '""' }
    expect(verifySalesforceServiceWebhook(SOAP, headers, SECRET)).toBe(false)
    expect(verifySalesforceServiceWebhook(SOAP, headers, ORG_ID)).toBe(false)
  })

  it('rejects the old copied Zendesk-style HMAC, correctly computed', () => {
    const ts = '1700000000'
    const sig = createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from(ts), JSON_BODY]))
      .digest('base64')
    const headers = {
      'x-salesforce-signature': sig,
      'x-salesforce-signature-timestamp': ts,
    }
    expect(verifySalesforceServiceWebhook(JSON_BODY, headers, SECRET)).toBe(false)
  })

  it('rejects any plain-body HMAC in any header, and a missing or empty secret', () => {
    const hex = createHmac('sha256', SECRET).update(JSON_BODY).digest('hex')
    const b64 = createHmac('sha256', SECRET).update(JSON_BODY).digest('base64')
    for (const headers of <Record<string, string>[]>[
      { 'x-signature': hex },
      // Data 360 data-action shape (HMAC-SHA256, base64, x-signature): a
      // different product, deliberately not accepted for Service Cloud.
      { 'x-signature': b64 },
      { 'x-hub-signature-256': `sha256=${hex}` },
      { authorization: `Bearer ${SECRET}` },
      { 'x-salesforce-signature': b64 },
      {},
    ]) {
      expect(verifySalesforceServiceWebhook(JSON_BODY, headers, SECRET)).toBe(false)
      expect(verifySalesforceServiceWebhook(JSON_BODY, headers, '')).toBe(false)
    }
  })

  it('is what the registered handler uses', () => {
    expect(SalesforceServiceWebhookHandler.verifyWebhook(SOAP, {}, SECRET)).toBe(false)
  })
})

describe('parseSalesforceServiceWebhookEvents', () => {
  it('emits one event per documented Notification, keyed by the notification Id', () => {
    const out = parseSalesforceServiceWebhookEvents({
      notifications: {
        OrganizationId: ORG_ID,
        ActionId: '04k000000000001AAA',
        Notification: [
          { Id: '04l000000000001AAA', sObject: { Id: '500000000000001AAA', Subject: 'Help' } },
          { Id: '04l000000000002AAA', sObject: { Id: '500000000000002AAA' } },
        ],
      },
    })
    expect(out).toHaveLength(2)
    for (const e of out) expect(WebhookEventSchema.parse(e)).toEqual(e)
    expect(out[0]).toMatchObject({
      id: '04l000000000001AAA',
      platform: 'salesforce-service',
      type: '04k000000000001AAA',
      resourceType: 'unknown',
      action: 'unknown',
      resourceId: '500000000000001AAA',
    })
    expect(out[1]!.id).toBe('04l000000000002AAA')
    expect(out[1]!.resourceId).toBe('500000000000002AAA')
  })

  it('accepts a single Notification and an unwrapped envelope', () => {
    const out = parseSalesforceServiceWebhookEvents({
      ActionId: 'a1',
      Notification: { Id: 'n1', sObject: { Id: 'r1' } },
    })
    expect(out.map((e) => [e.id, e.resourceId, e.type])).toEqual([['n1', 'r1', 'a1']])
  })

  it('no longer recognises the Zendesk-copied event shape', () => {
    expect(
      parseSalesforceServiceWebhookEvents({
        type: 'zen:event-type:ticket.created',
        detail: { id: 't1' },
      }),
    ).toEqual([])
  })
})
