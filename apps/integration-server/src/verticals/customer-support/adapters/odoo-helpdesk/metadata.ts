export const metadata = {
  platform: 'odoo-helpdesk',
  totalResources: 7,
  availableResources: ['ticket', 'message', 'contact', 'user', 'team'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Helpdesk is closed source (Odoo Enterprise only) and no public Odoo source or document names the model or ticket field that holds ticket tags, so they cannot be read without guessing.',
    },
    {
      resource: 'macro',
      reason:
        "Helpdesk has no macro model of its own. The nearest thing is the mail module's canned responses, whose model is mail.shortcode up to Odoo 17.0 and mail.canned.response from 18.0; an Odoo 14–18 connection does not record which version it is, so the model to read is unknown.",
    },
  ],
} as const
