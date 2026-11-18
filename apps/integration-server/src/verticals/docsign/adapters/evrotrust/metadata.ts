/**
 * Evrotrust adapter resource-coverage metadata.
 *
 * The Evrotrust vendor REST API exposes a narrow, transaction-centric surface:
 * every call targets a single `transactionID` (document) or `threadID`
 * (signing group / envelope). There are no list, audit-trail, or template
 * endpoints in the API.
 *
 * Docs: https://docs.evrotrust.com/docs/integration
 */
export const metadata = {
  platform: 'evrotrust',
  totalResources: 5,
  availableResources: ['envelope', 'document', 'signer'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'The Evrotrust vendor REST API has no audit trail or event-history endpoint; qualified-signature audit evidence is stored in the Evrotrust immutable archive and is not exposed to vendors via the REST API.',
    },
    {
      resource: 'template',
      reason:
        'The Evrotrust vendor REST API has no template management endpoint; documents are submitted directly per transaction with no reusable template concept.',
    },
  ],
} as const
