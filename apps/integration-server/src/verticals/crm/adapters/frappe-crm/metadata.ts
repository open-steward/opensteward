export const metadata = {
  platform: 'frappe-crm',
  totalResources: 6,
  availableResources: ['activity', 'company', 'contact', 'deal', 'note'],
  unavailableResources: [
    {
      resource: 'pipeline',
      reason:
        'Frappe CRM has no pipeline or stage doctype; deal progression is tracked via a CRM Deal Status field with no REST-queryable pipeline entity.',
    },
  ],
} as const
