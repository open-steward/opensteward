/**
 * Documented example responses, copied verbatim from Spiro's OpenAPI spec
 * (https://developers.spiro.ai/api/docs/v1/openapi.json), 200 examples of:
 *   CONTACTS_LIST        GET /api/v1/contacts
 *   CONTACT_GET          GET /api/v1/contacts/{id}
 *   COMPANIES_LIST       GET /api/v1/companies
 *   COMPANY_GET          GET /api/v1/companies/{id}
 *   OPPORTUNITIES_LIST   GET /api/v1/opportunities
 *   OPPORTUNITY_GET      GET /api/v1/opportunities/{id}
 *   PIPELINES_LIST       GET /api/v1/pipelines
 *   STAGES_LIST          GET /api/v1/pipelines/{pipeline_id}/opportunity_stages
 *   ACTIVITIES_LIST      GET /api/v1/activities
 *   NOTES_LIST           GET /api/v1/notes
 */
export const CONTACTS_LIST = {
  data: [
    {
      id: '208',
      type: 'contact',
      attributes: {
        id: 208,
        first_name: 'Charles',
        last_name: 'Howell',
        created_at: '2026-09-01T09:57:38.521Z',
        updated_at: '2026-09-01T09:57:38.521Z',
        title: 'agriculturist',
        phone: '303.165.1111',
        mobile_phone: '731.348.1560',
        home_phone: null,
        email: 'charles@armstrong.test',
        description: null,
        custom: {},
        external_id: null,
        email_opt_out: false,
      },
      relationships: {
        company: {
          data: {
            id: '441',
            type: 'company',
          },
        },
        user: {
          data: {
            id: '998',
            type: 'user',
          },
        },
      },
    },
    {
      id: '207',
      type: 'contact',
      attributes: {
        id: 207,
        first_name: 'Elden',
        last_name: 'Rogahn',
        created_at: '2026-09-01T09:57:38.516Z',
        updated_at: '2026-09-01T09:57:38.516Z',
        title: 'builder',
        phone: '1-754-822-6128',
        mobile_phone: '817-259-2747',
        home_phone: null,
        email: 'elden@jaskolski-thompson.example',
        description: null,
        custom: {},
        external_id: null,
        email_opt_out: false,
      },
      relationships: {
        company: {
          data: {
            id: '441',
            type: 'company',
          },
        },
        user: {
          data: {
            id: '998',
            type: 'user',
          },
        },
      },
    },
  ],
  included: [
    {
      id: '441',
      type: 'company',
      attributes: {
        id: 441,
        name: 'McKenzie, Corkery and Gibson',
        website: 'lang.test',
        address: '590 Kuphal Trafficway',
        city: 'Melodifurt',
        zipcode: '92145-2912',
        parent_id: null,
        country: 'Tuvalu',
        state: 'Massachusetts',
        phone: '373-920-4478 x98696',
        description: 'Open-source mission-critical analyzer',
        custom: {},
        created_at: '2026-09-01T09:57:38.511Z',
        updated_at: '2026-09-01T09:57:38.511Z',
        external_id: null,
      },
      relationships: {
        user: {
          data: {
            id: '998',
            type: 'user',
          },
        },
      },
    },
    {
      id: '998',
      type: 'user',
      attributes: {
        id: 998,
        first_name: 'Alfredo',
        last_name: 'Hermann',
        email: 'alfredo@oconner.example',
        phone: null,
        custom: {},
        external_id: null,
        status: 'created',
        role: 'normal',
        is_admin: false,
      },
      relationships: {
        manager: {
          data: null,
        },
      },
    },
  ],
  meta: {
    pagination: {
      current_page: 1,
      per_page: 10,
      total_pages: 1,
      next_page: null,
    },
  },
}

export const CONTACT_GET = {
  data: {
    id: '209',
    type: 'contact',
    attributes: {
      id: 209,
      first_name: 'Juliann',
      last_name: 'Welch',
      created_at: '2026-09-01T09:57:38.544Z',
      updated_at: '2026-09-01T09:57:38.544Z',
      title: 'mechanic',
      phone: '(282) 982-9557',
      mobile_phone: '142.956.9393',
      home_phone: null,
      email: 'juliann@hintz.example',
      description: null,
      custom: {},
      external_id: null,
      email_opt_out: false,
    },
    relationships: {
      company: {
        data: {
          id: '442',
          type: 'company',
        },
      },
      user: {
        data: {
          id: '999',
          type: 'user',
        },
      },
    },
  },
  included: [
    {
      id: '442',
      type: 'company',
      attributes: {
        id: 442,
        name: 'Beatty Group',
        website: 'conn.example',
        address: '111 Gladys Trail',
        city: 'Mayertmouth',
        zipcode: '27557-9110',
        parent_id: null,
        country: 'Honduras',
        state: 'Louisiana',
        phone: '935-596-8429 x1457',
        description: 'Virtual empowering collaboration',
        custom: {},
        created_at: '2026-09-01T09:57:38.540Z',
        updated_at: '2026-09-01T09:57:38.540Z',
        external_id: null,
      },
      relationships: {
        user: {
          data: {
            id: '1000',
            type: 'user',
          },
        },
      },
    },
    {
      id: '999',
      type: 'user',
      attributes: {
        id: 999,
        first_name: 'Ossie',
        last_name: 'Schneider',
        email: 'ossie@cummerata.test',
        phone: null,
        custom: {},
        external_id: null,
        status: 'created',
        role: 'normal',
        is_admin: false,
      },
      relationships: {
        manager: {
          data: null,
        },
      },
    },
  ],
}

export const COMPANIES_LIST = {
  data: [
    {
      id: '432',
      type: 'company',
      attributes: {
        id: 432,
        name: 'West-Schuster',
        website: 'parisian.test',
        address: '59433 Lucina Greens',
        city: 'North Glindabury',
        zipcode: '36791-9251',
        parent_id: null,
        country: 'Slovenia',
        state: 'Kansas',
        phone: '1-237-139-3783 x372',
        description: 'Compatible encompassing neural-net',
        custom: {},
        created_at: '2026-09-01T09:57:38.304Z',
        updated_at: '2026-09-01T09:57:38.304Z',
        external_id: null,
      },
      relationships: {
        user: {
          data: {
            id: '990',
            type: 'user',
          },
        },
      },
    },
    {
      id: '433',
      type: 'company',
      attributes: {
        id: 433,
        name: 'Kassulke-Shanahan',
        website: 'carter.test',
        address: '14995 Forest Station',
        city: 'East Sondra',
        zipcode: '72551-8890',
        parent_id: null,
        country: 'Martinique',
        state: 'South Dakota',
        phone: '820.435.8601',
        description: 'Networked incremental time-frame',
        custom: {},
        created_at: '2026-09-01T09:57:38.308Z',
        updated_at: '2026-09-01T09:57:38.308Z',
        external_id: null,
      },
      relationships: {
        user: {
          data: {
            id: '990',
            type: 'user',
          },
        },
      },
    },
  ],
  meta: {
    pagination: {
      current_page: 1,
      per_page: 25,
      total_pages: 1,
      next_page: null,
    },
  },
}

export const COMPANY_GET = {
  data: {
    id: '434',
    type: 'company',
    attributes: {
      id: 434,
      name: 'Hagenes, Towne and Hauck',
      website: 'mcglynn.example',
      address: '6161 Zemlak Junction',
      city: 'Hammesmouth',
      zipcode: '67367-3864',
      parent_id: null,
      country: 'Malta',
      state: 'Kansas',
      phone: '963-337-2915 x94253',
      description: 'Fully-configurable motivating info-mediaries',
      custom: {
        string_field: null,
        date_field: null,
        float_field: null,
        integer_field: 10,
        link_field: null,
        list_field: null,
        multipleselect_field: null,
        contact_lookup: null,
      },
      created_at: '2026-09-01T09:57:38.326Z',
      updated_at: '2026-09-01T09:57:38.326Z',
      external_id: null,
    },
    relationships: {
      user: {
        data: {
          id: '991',
          type: 'user',
        },
      },
    },
  },
  included: [
    {
      id: '991',
      type: 'user',
      attributes: {
        id: 991,
        first_name: 'Kasey',
        last_name: 'Gleason',
        email: 'kasey@zemlak.example',
        phone: null,
        custom: {},
        external_id: null,
        status: 'created',
        role: 'normal',
        is_admin: false,
      },
      relationships: {
        manager: {
          data: null,
        },
      },
    },
  ],
}

export const OPPORTUNITIES_LIST = {
  data: [
    {
      id: '117',
      type: 'opportunity',
      attributes: {
        id: 117,
        name: 'Ernser-Lueilwitz',
        close_at: '2026-09-26',
        amount: '6236.41',
        updated_at: '2026-09-01T09:57:39.426Z',
        description: 'Shoes & Automotive',
        custom: {},
        external_id: null,
        currency: null,
        created_at: '2026-09-01T09:57:39.426Z',
      },
      relationships: {
        company: {
          data: {
            id: '478',
            type: 'company',
          },
        },
        pipeline: {
          data: {
            id: '126',
            type: 'pipeline',
          },
        },
        opportunity_stage: {
          data: {
            id: '367',
            type: 'opportunity_stage',
          },
        },
        user: {
          data: {
            id: '1061',
            type: 'user',
          },
        },
      },
    },
    {
      id: '116',
      type: 'opportunity',
      attributes: {
        id: 116,
        name: 'Kris, Jast and Hilpert',
        close_at: '2026-09-17',
        amount: '6353.65',
        updated_at: '2026-09-01T09:57:39.417Z',
        description: 'Sports',
        custom: {},
        external_id: null,
        currency: null,
        created_at: '2026-09-01T09:57:39.418Z',
      },
      relationships: {
        company: {
          data: {
            id: '477',
            type: 'company',
          },
        },
        pipeline: {
          data: {
            id: '125',
            type: 'pipeline',
          },
        },
        opportunity_stage: {
          data: {
            id: '364',
            type: 'opportunity_stage',
          },
        },
        user: {
          data: {
            id: '1061',
            type: 'user',
          },
        },
      },
    },
  ],
  meta: {
    pagination: {
      current_page: 1,
      per_page: 10,
      total_pages: 1,
      next_page: null,
    },
  },
}

export const OPPORTUNITY_GET = {
  data: {
    id: '118',
    type: 'opportunity',
    attributes: {
      id: 118,
      name: 'Langosh and Sons',
      close_at: '2026-09-03',
      amount: '4075.59',
      updated_at: '2026-09-01T09:57:39.444Z',
      description: 'Kids',
      custom: {},
      external_id: null,
      currency: null,
      created_at: '2026-08-30T09:57:39.437Z',
    },
    relationships: {
      company: {
        data: {
          id: '479',
          type: 'company',
        },
      },
      pipeline: {
        data: {
          id: '127',
          type: 'pipeline',
        },
      },
      opportunity_stage: {
        data: {
          id: '370',
          type: 'opportunity_stage',
        },
      },
      user: {
        data: {
          id: '1064',
          type: 'user',
        },
      },
    },
  },
  included: [
    {
      id: '479',
      type: 'company',
      attributes: {
        id: 479,
        name: 'Borer Group',
        website: 'simonis-oconner.example',
        address: '315 Rosenbaum Cliffs',
        city: 'Emmittfort',
        zipcode: '37865',
        parent_id: null,
        country: 'Swaziland',
        state: 'Rhode Island',
        phone: '1-454-585-2986',
        description: 'Programmable homogeneous encoding',
        custom: {},
        created_at: '2026-09-01T09:57:39.441Z',
        updated_at: '2026-09-01T09:57:39.441Z',
        external_id: null,
      },
      relationships: {
        user: {
          data: {
            id: '1065',
            type: 'user',
          },
        },
      },
    },
    {
      id: '1064',
      type: 'user',
      attributes: {
        id: 1064,
        first_name: 'Mindy',
        last_name: 'DuBuque',
        email: 'mindy@abbott.test',
        phone: null,
        custom: {},
        external_id: null,
        status: 'created',
        role: 'normal',
        is_admin: false,
      },
      relationships: {
        manager: {
          data: null,
        },
      },
    },
  ],
}

export const PIPELINES_LIST = {
  data: [
    {
      id: '133',
      type: 'pipeline',
      attributes: {
        id: 133,
        name: 'Pipeline 16',
        is_active: true,
        index: 0,
      },
      relationships: {
        opportunity_stages: {
          data: [
            {
              id: '385',
              type: 'opportunity_stage',
            },
            {
              id: '386',
              type: 'opportunity_stage',
            },
            {
              id: '387',
              type: 'opportunity_stage',
            },
          ],
        },
      },
    },
    {
      id: '132',
      type: 'pipeline',
      attributes: {
        id: 132,
        name: 'Pipeline 15',
        is_active: true,
        index: 0,
      },
      relationships: {
        opportunity_stages: {
          data: [
            {
              id: '382',
              type: 'opportunity_stage',
            },
            {
              id: '383',
              type: 'opportunity_stage',
            },
            {
              id: '384',
              type: 'opportunity_stage',
            },
          ],
        },
      },
    },
  ],
  meta: {
    pagination: {
      current_page: 1,
      per_page: 10,
      total_pages: 1,
      next_page: null,
    },
  },
}

export const STAGES_LIST = {
  data: [
    {
      id: '379',
      type: 'opportunity_stage',
      attributes: {
        id: 379,
        name: 'Stage 37',
        is_closed: false,
        is_won: false,
        is_active: true,
        index: 1,
        created_at: '2026-09-01T09:57:39.544Z',
      },
      relationships: {
        pipeline: {
          data: {
            id: '131',
            type: 'pipeline',
          },
        },
      },
    },
    {
      id: '380',
      type: 'opportunity_stage',
      attributes: {
        id: 380,
        name: 'Stage 38',
        is_closed: true,
        is_won: true,
        is_active: true,
        index: 2,
        created_at: '2026-09-01T09:57:39.544Z',
      },
      relationships: {
        pipeline: {
          data: {
            id: '131',
            type: 'pipeline',
          },
        },
      },
    },
    {
      id: '381',
      type: 'opportunity_stage',
      attributes: {
        id: 381,
        name: 'Stage 39',
        is_closed: true,
        is_won: false,
        is_active: true,
        index: 3,
        created_at: '2026-09-01T09:57:39.545Z',
      },
      relationships: {
        pipeline: {
          data: {
            id: '131',
            type: 'pipeline',
          },
        },
      },
    },
  ],
  meta: {
    pagination: {
      current_page: 1,
      per_page: 25,
      total_pages: 1,
      next_page: null,
    },
  },
}

export const ACTIVITIES_LIST = {
  data: [
    {
      id: '151',
      type: 'activity',
      attributes: {
        id: 151,
        interacted_at: '2026-09-01T09:57:37.932Z',
        subject: 'ipsam',
        description: 'Tempore tempora accusantium aperiam.',
        status: null,
        disposition: 'undefined',
        call_status: null,
        result: 0,
        custom: {},
        external_id: null,
        custom_activity_type: null,
        call_duration: null,
      },
      relationships: {
        user: {
          data: {
            id: '956',
            type: 'user',
          },
        },
      },
    },
    {
      id: '152',
      type: 'activity',
      attributes: {
        id: 152,
        interacted_at: '2026-09-01T09:57:37.957Z',
        subject: 'id',
        description: 'Nihil qui rerum iure.',
        status: null,
        disposition: 'undefined',
        call_status: null,
        result: 0,
        custom: {},
        external_id: null,
        custom_activity_type: null,
        call_duration: null,
      },
      relationships: {
        user: {
          data: {
            id: '956',
            type: 'user',
          },
        },
      },
    },
    {
      id: '153',
      type: 'activity',
      attributes: {
        id: 153,
        interacted_at: '2026-09-01T09:57:37.961Z',
        subject: 'consequuntur',
        description: 'Error temporibus quaerat omnis.',
        status: null,
        disposition: 'undefined',
        call_status: null,
        result: 0,
        custom: {},
        external_id: null,
        custom_activity_type: null,
        call_duration: null,
      },
      relationships: {
        user: {
          data: {
            id: '956',
            type: 'user',
          },
        },
      },
    },
    {
      id: '154',
      type: 'activity',
      attributes: {
        id: 154,
        interacted_at: '2026-09-01T09:57:37.964Z',
        subject: 'nam',
        description: 'Et fugiat sapiente omnis.',
        status: null,
        disposition: 'undefined',
        call_status: null,
        result: 0,
        custom: {},
        external_id: null,
        custom_activity_type: null,
        call_duration: null,
      },
      relationships: {
        user: {
          data: {
            id: '956',
            type: 'user',
          },
        },
      },
    },
    {
      id: '155',
      type: 'activity',
      attributes: {
        id: 155,
        interacted_at: '2026-09-01T09:57:37.977Z',
        subject: 'nihil',
        description: 'Vero repudiandae dolores tenetur.',
        status: null,
        disposition: 'undefined',
        call_status: null,
        result: 0,
        custom: {},
        external_id: null,
        custom_activity_type: null,
        call_duration: null,
      },
      relationships: {
        user: {
          data: {
            id: '956',
            type: 'user',
          },
        },
      },
    },
  ],
  meta: {
    pagination: {
      current_page: 1,
      per_page: 25,
      total_pages: 1,
      next_page: null,
    },
  },
}

export const NOTES_LIST = {
  data: [
    {
      id: '179',
      type: 'note',
      attributes: {
        id: 179,
        subject: 'voluptas',
        description: 'Voluptatem et necessitatibus repellendus.',
        interacted_at: '2026-09-01T09:57:39.193Z',
        custom: {},
        external_id: null,
      },
      relationships: {
        user: {
          data: {
            id: '1041',
            type: 'user',
          },
        },
      },
    },
    {
      id: '180',
      type: 'note',
      attributes: {
        id: 180,
        subject: 'dolor',
        description: 'Blanditiis suscipit est libero.',
        interacted_at: '2026-09-01T09:57:39.196Z',
        custom: {},
        external_id: null,
      },
      relationships: {
        user: {
          data: {
            id: '1041',
            type: 'user',
          },
        },
      },
    },
    {
      id: '181',
      type: 'note',
      attributes: {
        id: 181,
        subject: 'voluptatem',
        description: 'Minus suscipit provident deserunt.',
        interacted_at: '2026-09-01T09:57:39.198Z',
        custom: {},
        external_id: null,
      },
      relationships: {
        user: {
          data: {
            id: '1041',
            type: 'user',
          },
        },
      },
    },
    {
      id: '182',
      type: 'note',
      attributes: {
        id: 182,
        subject: 'aut',
        description: 'Et enim sed cum.',
        interacted_at: '2026-09-01T09:57:39.200Z',
        custom: {},
        external_id: null,
      },
      relationships: {
        user: {
          data: {
            id: '1041',
            type: 'user',
          },
        },
      },
    },
    {
      id: '183',
      type: 'note',
      attributes: {
        id: 183,
        subject: 'voluptas',
        description: 'Molestias corrupti possimus et.',
        interacted_at: '2026-09-01T09:57:39.203Z',
        custom: {},
        external_id: null,
      },
      relationships: {
        user: {
          data: {
            id: '1041',
            type: 'user',
          },
        },
      },
    },
  ],
  meta: {
    pagination: {
      current_page: 1,
      per_page: 25,
      total_pages: 1,
      next_page: null,
    },
  },
}
