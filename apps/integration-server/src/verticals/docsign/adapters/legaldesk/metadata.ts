export const metadata = {
  platform: 'legaldesk',
  totalResources: 5,
  availableResources: ['envelope'],
  unavailableResources: [
    {
      resource: 'template',
      reason:
        'LegalDesk exposes a CCA Aadhaar eSign transaction API only; there is no template REST resource in the platform — documents are attached per-transaction, not managed as reusable templates.',
    },
    {
      resource: 'audit-trail-entry',
      reason:
        'LegalDesk publishes no endpoint for this resource. Its only API page (https://legaldesk.com/what-are-esign-and-ekyc-api) says "The eSign API allows you to get your customers’ signature on documents electronically using Aadhaar-based eSign service" and "click the button below and submit your request", with no path, parameter or response documented.',
    },
    {
      resource: 'document',
      reason:
        'LegalDesk publishes no endpoint for this resource. Its only API page (https://legaldesk.com/what-are-esign-and-ekyc-api) says "The eSign API allows you to get your customers’ signature on documents electronically using Aadhaar-based eSign service" and "click the button below and submit your request", with no path, parameter or response documented.',
    },
    {
      resource: 'signer',
      reason:
        'LegalDesk publishes no endpoint for this resource. Its only API page (https://legaldesk.com/what-are-esign-and-ekyc-api) says "The eSign API allows you to get your customers’ signature on documents electronically using Aadhaar-based eSign service" and "click the button below and submit your request", with no path, parameter or response documented.',
    },
  ],
} as const
