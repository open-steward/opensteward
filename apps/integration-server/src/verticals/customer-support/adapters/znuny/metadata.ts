/**
 * Znuny adapter metadata.
 *
 * GenericTicketConnectorREST exposes only Session + Ticket operations.
 * Contacts, Users, Tags, Teams, and Macros have no REST endpoints in the
 * standard Znuny web service.
 *
 * Sources:
 *   https://doc.znuny.org/znuny/admin/webservices/examples/GenericTicketConnectorREST/
 *   https://github.com/znuny/Znuny/blob/dev/development/webservices/GenericTicketConnectorREST.yml
 *   https://github.com/znuny/Znuny/tree/dev/Kernel/GenericInterface/Operation
 *   https://community.znuny.org/viewtopic.php?t=39600
 */
export const metadata = {
  platform: 'znuny',
  totalResources: 7,
  availableResources: ['ticket', 'message'],
  unavailableResources: [
    {
      resource: 'contact',
      reason:
        'GenericTicketConnectorREST exposes no customer/contact endpoints; the Znuny REST web service has no contact list or get operation',
    },
    {
      resource: 'user',
      reason:
        'GenericTicketConnectorREST exposes no agent/user endpoints; the Znuny GenericInterface Operation folder contains no User list operation for the REST connector',
    },
    {
      resource: 'tag',
      reason:
        'GenericTicketConnectorREST exposes no tag endpoints; ticket tags are inline strings on tickets, not a queryable REST resource',
    },
    {
      resource: 'team',
      reason:
        'GenericTicketConnectorREST exposes no queue/team endpoints; queue data only appears as fields on individual tickets',
    },
    {
      resource: 'macro',
      reason:
        'Znuny has no canned-response/macro concept exposed via any documented REST API endpoint',
    },
  ],
} as const
