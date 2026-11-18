/**
 * Example results from https://www.membrain.com/developers/api-documentation
 * (fetched 2026-09-25), copied from the page with the custom fields and the
 * address blocks trimmed. Values are the docs' own, including their
 * placeholder GUIDs.
 */

/** "GET /contacts/" Example Result, items[0]. */
export const DOC_CONTACT = {
  Id: '32e205ca-5dad-44ef-a02f-65f846170c1d',
  CreatedById: '94a479da-5e9a-4d14-b909-562da1664533',
  CreatedByName: 'Some User',
  CreatedDate: '2018-04-27 19:30:46.496799',
  ChangedById: 'df8c074f-180f-4564-a80a-ef960d01bd58',
  ChangedByName: 'Some Other User',
  ChangedDate: '2023-06-07 10:24:37.926643',
  Name: 'Alicia Vikander',
  EmailAddress: 'alicia.vikander@membrain.com',
  CompanyId: '2cc29974-fa8e-4107-b140-86a0a951f963',
  CompanyName: 'Membrain',
  ShortName: '',
  FirstName: 'Alicia',
  LastName: 'Vikander',
  Position: 'SDR',
  Retired: 'false',
  Notes: '',
  WorkPhone: '616 292 7124',
  CellularPhone: '838 780 8163',
  HomePhone: '',
  LabelIds: '',
  LabelNames: '',
  LinkedIn: 'https://linkedin.com/profile/alicia.vikander',
  ExternalIdentifier: '',
  ReportsToPersonId: '00000000-0000-0000-0000-000000000000',
  SecondaryEmailAddresses: '',
}

/** "GET /companies/" Example Result, items[0]. */
export const DOC_COMPANY = {
  Id: '24044e67-2158-4c1e-81be-9233239dd543',
  CreatedById: 'e30a2d31-20c7-40a7-a097-865f652aae0b',
  CreatedByName: 'Sophie Juliet',
  CreatedDate: '2032-02-03 11:23:03.123456',
  ChangedById: 'aa0e40a1-7yui-41e4-a599-c48b72155071',
  ChangedByName: 'Ben Bron',
  ChangedDate: '2032-10-25 08:22:03.123456',
  Name: 'Socks Are Us',
  City: 'Stockholm',
  CountryName: 'Sweden',
  CountryCode: '46',
  EmailAddress: 'email@domain.com',
  Homepage: 'https://domain.com',
  LabelIds: 'd76d7668-fcce-40ff-87ba-bfb2d65daa9e',
  LabelNames: 'Client (self-service)',
  Notes: 'Sells Socks',
  ExternalIdentifier: '',
  Phone: '+46-8+5551234',
  ParentCompanyId: '00000000-0000-0000-0000-000000000000',
  ParentCompanyName: '',
  SalesPersonId: 'e30a2d31-20c7-40a7-a097-909f652aae0b',
  SalesPersonName: 'Sophie Juliet',
  State: '',
}

/** "GET /opportunities/{Id}" Example Result. */
export const DOC_OPPORTUNITY = {
  Id: '3456b1a7-c56a-4528-b415-aa19455841d1',
  CreatedById: '3357bea5-def8-4207-a18f-c632e7e567a2',
  CreatedByName: 'Meryl Streep',
  CreatedDate: '2018-12-17 10:16:50.123456',
  ChangedDate: '2019-02-14 10:16:50.123456',
  Deleted: 'false',
  CompanyId: '6efd2550-81db-4f45-b7a8-2ff8c2cbf93d',
  CompanyName: 'AB',
  EstimatedClosingDate: '2019-02-14 12:00:02.123456',
  LostComment: '',
  LostReasonId: '75a72211-456j-4251-a669-a9a9c3f9d8c5',
  LostReasonName: 'Strategic (Long-term)',
  Name: 'AB',
  OpportunityOwnerId: '3357bea5-def8-6907-a18f-c632e7e320a2',
  OpportunityOwnerName: 'Martin Nedbal',
  Probability: '100',
  ProcessId: '2a1fc16f-25gh-4ad0-97da-cbcf2a582d0c',
  ProcessCurrentStageName: 'Committment',
  ProcessCurrentStageId: '73a3d59c-8b0f-40d3-b115-07c3fdd6814d',
  ProcessEndedDate: '2019-02-14 14:44:11.123456',
  Status: 'Won',
  Value: '180758',
  ValueInCurrency: '180758',
  WeightedValue: '180758',
  ValueCurrencyName: '',
  ValueCurrencyCode: '',
  ValueCurrencyId: '00000000-0000-0000-0000-000000000000',
}

/** "GET /salesProcesses/" Example Result, [0] (custom-field options trimmed). */
export const DOC_SALES_PROCESS = {
  Id: '6ab83f5c-8e49-4182-b273-c97433525c45',
  Name: 'Sales Process',
  Stages: [
    {
      Id: '481eaa00-dae4-4d57-afc8-52d024512786',
      Name: 'Engage',
      Steps: [
        { Id: 'a7883063-ccb9-4107-99b7-c15c40edf5c1', Name: 'First Step' },
        { Id: '0e8218d1-cc6f-45f1-86cd-711d715c2024', Name: 'Second Step' },
        { Id: '13c8b6d6-a1b4-4511-b167-f2c62e3f3928', Name: 'Third Step' },
      ],
    },
    {
      Id: '5e2a0e33-e94f-4da2-911f-b59a900ac16d',
      Name: 'Close',
      Steps: [
        { Id: 'eacf403b-dff8-47c5-8629-ecaf52130d41', Name: 'Fourth Step' },
        { Id: '1c8171a3-5523-41b5-ab28-06a0c10e2e0b', Name: 'Fifth Step' },
      ],
    },
  ],
  CustomFields: [
    { Id: '9106cf69-0adf-4b71-98f8-d8dd42b3c6b4', Name: 'Business Goals', Type: 'Text' },
  ],
}

const PARTICIPANTS = [
  {
    Id: '2c298bb6-8a04-48af-b3fc-52d03d1a0d12',
    PersonId: '9e13db78-7df6-45fc-a652-5e7193d185cb',
    PersonName: 'Al Pacino (Hawaii)',
    CompanyId: '799dc80d-1368-44c7-ab35-246e082b7a00',
    CompanyName: 'Membrain',
    IsOrganizer: 'true',
    InviteStatus: 'NotSent',
  },
]

/** "GET /activities/" Example Result, items[1] (a Task). */
export const DOC_TASK = {
  Id: 'b7c1ad6f-a2f5-4d85-9b38-d743434eafa4',
  CreatedById: '9e13db78-7df6-45fc-a652-5e7193d185cb',
  CreatedByName: 'Al Pacino (Hawaii)',
  CreatedDate: '2019-01-18 17:03:00.123456',
  ChangedDate: '2019-01-18 17:03:22.123456',
  ActivityTypeName: 'Sales Call',
  ActivityTypeId: '9a03cdcd-9b6f-4df1-bbbd-69bd9f3defc1',
  Contents: 'No reply.',
  Completed: 'true',
  CompletedDate: '2019-01-18 17:03:44.123456',
  HasExplicitTime: 'true',
  Important: 'false',
  Deadline: '2019-01-19 03:03:00.123456',
  FromDate: '1753-01-01 00:00:00.000000',
  IsRecurring: 'false',
  Participants: PARTICIPANTS,
  Private: 'false',
  Location: '',
  Relateds: [
    {
      Id: '641e9c07-5d74-41f8-a517-e18b6961bdd3',
      RelatedId: '48105796-fa6a-4fdf-9f09-84f981c8b945',
      RelatedClassName: 'Company',
      RelatedName: 'Akcelo',
    },
    {
      Id: 'b555542c-6c30-4e78-a4a2-546cc11a8a82',
      RelatedId: '97c4d3ee-4467-4808-a8e6-b619a3077e34',
      RelatedClassName: 'Opportunity',
      RelatedName: 'Akcelo',
    },
  ],
  SortOrder: '0',
  ToDate: '1753-01-01 00:00',
  Type: 'Task',
}

/** "GET /activities/" Example Result, items[0] (Type "Activity": an Appointment). */
export const DOC_APPOINTMENT = {
  Id: 'a9a0711f-7753-4e9a-9ba4-46437a243c45',
  ActivityTypeName: 'Important Appointment',
  ActivityTypeId: 'c71b5065-1b31-4aa1-b1b1-e14c8cc8f8a2',
  Contents:
    'Me and Hedvige synced up and identified what we believe is the next steps we should take.',
  Completed: 'true',
  OrganizerId: '251f76ff-aca7-5675-ce39-144b97c1e627',
  Deadline: '2019-01-03 21:23:00.123456',
  FromDate: '1753-01-01 00:00:00.000000',
  ToDate: '1753-01-01 00:00',
  Participants: PARTICIPANTS,
  Relateds: [
    {
      Id: 'cd4074c7-8b55-4044-ab1c-a08aa25d770a',
      RelatedId: 'e823397a-747e-47ff-bdd8-43818a7e33dc',
      RelatedClassName: 'Company',
      RelatedName: 'Web Guide Partner Scandinavia Ab',
    },
  ],
  Type: 'Activity',
}

/** "GET /activities/" items[2] with Type set to "Note" (the docs show no Note example; Type "Note" is documented). */
export const DOC_NOTE = {
  Id: 'e74ae670-0cf3-4d44-9b2a-7a6bcba1b517',
  CreatedById: '9e13db78-7df6-45fc-a652-5e7193d185cb',
  CreatedDate: '2019-01-18 17:17:22.123456',
  Contents: 'Hello Dania, I hope everything is well!',
  Private: 'false',
  Relateds: [
    {
      Id: 'ccdf1a95-a452-4673-b48a-4c575ae1c05b',
      RelatedId: '5c34b42e-92e4-470b-87b1-2191eed55e6c',
      RelatedClassName: 'Company',
      RelatedName: 'EcoCentric',
    },
    {
      Id: '9c1283f4-03e0-47e6-8d51-f7de7492c10e',
      RelatedId: 'fa6f9364-b0aa-4bdc-b15c-c57aef87f3ad',
      RelatedClassName: 'Opportunity',
      RelatedName: 'EcoCentric',
    },
  ],
  Type: 'Note',
}
