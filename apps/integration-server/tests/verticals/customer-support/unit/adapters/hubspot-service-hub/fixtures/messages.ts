/**
 * HubSpot's documented message rows, shared by the transform and listMessages
 * tests. The MESSAGE and WELCOME_MESSAGE rows are the documented response of
 * `GET /conversations/v3/conversations/threads/{threadId}/messages`
 * (developers.hubspot.com/docs/api-reference/legacy/conversations/guide,
 * "Get actors"). The COMMENT row is the guide's documented comment body
 * ("type": "COMMENT", "text": "Can you follow up?") carrying the fields the
 * Conversations v3 spec (api.hubspot.com/public/api/spec/v2/specs/release/22196/version/3)
 * marks required on `PublicComment`.
 */
import type { RawHubspotMessage } from '../../../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/transform/message'

/** The guide's documented MESSAGE row, verbatim. */
export const DOC_INCOMING_MESSAGE: RawHubspotMessage = {
  id: '3ad3474b08dd408ca57a8454e355e942',
  conversationsThreadId: '176347007',
  createdAt: '2019-11-18T18:47:59.949Z',
  updatedAt: '2019-11-18T18:47:59.949Z',
  createdBy: 'V-1401',
  client: { clientType: 'SYSTEM' },
  senders: [
    {
      actorId: 'V-1401',
      deliveryIdentifier: {
        type: 'CHANNEL_SPECIFIC_OPAQUE_ID',
        value: '0232d1661ef84248bd4923cce9d3b917',
      },
    },
  ],
  recipients: [
    {
      actorId: 'V-47190242997',
      deliveryIdentifier: {
        type: 'CHANNEL_SPECIFIC_OPAQUE_ID',
        value: '673cdff6b41c464aa3399c09a898862e',
      },
    },
  ],
  archived: false,
  text: 'hi yes hello',
  richText: '<div>hi yes hello</div>',
  attachments: [],
  truncationStatus: 'NOT_TRUNCATED',
  status: { statusType: 'RECEIVED' },
  direction: 'INCOMING',
  channelId: '1000',
  channelAccountId: '148662',
  type: 'MESSAGE',
}

/** The guide's documented WELCOME_MESSAGE row, verbatim. */
export const DOC_WELCOME_MESSAGE: RawHubspotMessage = {
  id: '0c9b86b11210479eb1ae193ec5add0b7',
  conversationsThreadId: '176347007',
  createdAt: '2019-11-18T18:47:59.947Z',
  createdBy: 'S-hubspot',
  client: { clientType: 'SYSTEM' },
  senders: [{ actorId: 'S-hubspot' }],
  recipients: [
    {
      actorId: 'V-1401',
      deliveryIdentifier: {
        type: 'CHANNEL_SPECIFIC_OPAQUE_ID',
        value: '0232d1661ef84248bd4923cce9d3b917',
      },
    },
  ],
  archived: false,
  text: "Got any questions? I'm happy to help.",
  channelId: '1000',
  channelAccountId: '148662',
  type: 'WELCOME_MESSAGE',
}

/** The guide's COMMENT body, with PublicComment's required fields. */
export const DOC_COMMENT: RawHubspotMessage = {
  id: 'c0ffee00000000000000000000000001',
  conversationsThreadId: '176347007',
  createdAt: '2019-11-18T18:55:00.000Z',
  createdBy: 'A-2620022',
  client: { clientType: 'HUBSPOT' },
  senders: [{ actorId: 'A-2620022' }],
  recipients: [],
  archived: false,
  text: 'Can you follow up?',
  richText: '<p>Can you follow up?</p>',
  attachments: [{ type: 'FILE', fileId: '99', fileUsageType: 'IMAGE' }, { type: 'MESSAGE_HEADER' }],
  type: 'COMMENT',
}
