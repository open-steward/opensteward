/**
 * The documented example responses ("default demo example") of the Alibaba.com
 * Open Platform APIs this adapter calls, copied verbatim from the first-party
 * API reference JSON:
 *   https://openapi.alibaba.com/handler/share/apidoc/getApi.json?<cid&path>&methodType=GET/POST
 * (the data behind https://openapi.alibaba.com/doc/api.htm). Each constant
 * names its source. The examples serialise every scalar as a string.
 */

/** cid=1&path=/alibaba/icbu/product/list */
export const PRODUCT_LIST = {
  result: {
    total_item: '200',
    trace_id: 'rfksafnakjff98',
    curr_page: '1',
    error_msg: 'please try again later',
    error_code: 'system error',
    page_size: '20',
    products: [
      {
        gmt_create: '2020-12-22 12:00:00',
        keywords: [],
        owner_member_display_name: 'james',
        group_name: 'new',
        subject: 'new mp3 player',
        main_image: {
          watermark_position: 'center',
          images: [],
          watermark: 'true',
          watermark_frame: 'Y',
        },
        display: 'Y',
        pc_detail_url:
          'https://www.alibaba.com/product-detail/Eco-Friendly-100-Biodegradable-Cornstarch-Trash_60832548452.html?spm=a2700.galleryofferlist.normalList.12.6c612db4ueHAW2&fullFirstScreen=true',
        language: 'english',
        gmt_modified: '2020-12-22 12:00:00',
        specific: 'true',
        rts: 'rts',
        product_type: 'sourcing',
        category_id: '333',
        group_id: '2344',
        smart_edit: 'true',
        owner_member: '24666790',
        id: '188909844009',
        status: 'approved',
      },
    ],
  },
  code: '0',
  request_id: '0ba2887315178178017221014',
}

/** cid=11&path=/alibaba/icbu/product/get/v2 */
export const PRODUCT_GET_V2 = {
  msg_code: 'B_PRODUCT_PARAM_INVALID',
  code: '0',
  success: 'true',
  product_info: {
    category_info: {
      category_name: "Apparel & Accessories / Men's Clothing / Men's T-Shirts",
      category_id: '127734143',
      attributes: [
        {
          attribute_name: 'Sleeve Style',
          attribute_value: 'Regular',
        },
      ],
    },
    basic_info: {
      product_images: [
        {
          image_url: 'https://sc04.alicdn.com/kf/Hafea40435f2f4354b81fb4e5476fc65cT.png',
        },
      ],
      keywords: 'Red 8GB mp3 for sports',
      create_timestamp: '1747809487000',
      product_id: '1601449197602',
      last_modified_timestamp: '1748249727000',
      description: 'product details',
      language: 'en_US',
      owner_ali_id: '17379911544',
      audit_status: 'approved',
      model_number: 'BCD126748',
      title: 'this is a sample title',
      status: 'online',
    },
    trade_info: {
      unit: 'Kilometer',
      sku_info: [
        {
          sku_price: {
            price: '10',
            currency: 'USD',
          },
          sku_id: '106714736001',
          inventory: '[]',
          sale_attributes: [
            {
              image: {
                image_url: 'https://sc04.alicdn.com/kf/Hafea40435f2f4354b81fb4e5476fc65cT.png',
              },
              attribute_name: 'Color',
              attribute_value: 'Black',
            },
          ],
          sku_code: '3523LDS',
        },
      ],
      price: {
        price_type: 'RANGE',
        currency: 'USD',
        range_price: {
          max_price: '20',
          min_price: '10',
        },
        tiered_price: [
          {
            quantity: '2',
            price: '10',
          },
        ],
      },
      inventory: '1000',
      moq: '2',
    },
    logistics_info: {
      shipping_template_id: '1',
      tiered_lead_time: [
        {
          quantity: '100',
          lead_time: '3',
        },
      ],
      weight: '10',
      desi: '10',
      dimension: {
        length: '10',
        width: '10',
        height: '10',
      },
    },
  },
  message: 'productId or skuId is required',
  request_id: '0ba2887315178178017221014',
}

/** cid=1&path=/icbu/product/inventory/get */
export const INVENTORY_GET = {
  result: {
    data_list: [
      {
        sku_id: '33323',
        inventory: '100',
        sku_outer_id: 'Red',
        inventory_code: 'CN_LOCAL_01',
      },
    ],
    trace_id: '484792239344223',
    msg_code: 'SYSTEM_ERROR',
    message_info: 'System error, please try again later',
    success: 'true',
  },
  code: '0',
  request_id: '0ba2887315178178017221014',
}

/** cid=8&path=/alibaba/order/list */
export const ORDER_LIST = {
  code: '0',
  value: {
    total_count: '264930',
    order_list: [
      {
        trade_id: '271207727001028893',
        trade_status: 'unpay',
        create_date: {
          format_date: 'Jul. 31, 2025, 21:09:36 PDT.',
          timestamp: '1754021376000',
        },
        modify_date: {
          format_date: 'Jul. 31, 2025, 21:09:37 PDT.',
          timestamp: '1754021377000',
        },
      },
    ],
  },
  request_id: '0ba2887315178178017221014',
}

/** cid=8&path=/alibaba/order/get */
export const ORDER_GET = {
  code: '0',
  value: {
    seller: {
      immutable_eid: 'kx++Dlfuw+osaJiw08no/A==',
      full_name: 'mary mary',
      immutable_eAdminId: 'kx++Dlfuw+xxxxxx/A==',
    },
    attachments: [
      {
        waybill_number: 'SF12345',
        file_usage: 'DISTRIBUTION_WAY_BILL',
        file_name: 'hello.jpg',
        service_provider_name: 'SF',
        url: 'https://xxxxxxx',
      },
    ],
    nation: 'US',
    discount_amount: {
      amount: '0.0000',
      currency: 'USD',
    },
    shipment_method: 'EXPRESS',
    remark: 'null',
    shipment_date: {
      duration: '7',
      date: {
        format_date: 'MMM. d, yyyy, HH:mm:ss z.',
        timestamp: '213453',
      },
      type: 'relative',
    },
    draft_role: 'seller',
    order_products: [
      {
        unit: 'Pieces',
        quantity: '2.0000',
        product_image: 'https://sc04.alicdn.com/kf/H519351ec653a43b99a599b9318c8938cz.jpg',
        product_id: '1601314875038',
        sku_attributes: [
          {
            value: '10A',
            key: 'Maximum Current',
          },
        ],
        name: 'yanwen combine test aliqatest',
        sku_id: '106117950042',
        sort: '1',
        id: '133658eea7a2b5d8e0cbb6877ec6fff0',
        model_number: '10A/20A/30A',
        unit_price: {
          amount: '0.1000',
          currency: 'USD',
        },
        sku_code: '1',
      },
    ],
    shipment_insurance_fee: {
      amount: '1.0',
      currency: 'USD',
    },
    trade_id: '234193410001028893',
    vat_amount: {
      amount: '1.0',
      currency: 'USD',
    },
    fulfillment_channel: 'TAD',
    trade_status: 'unpay',
    export_service_type: 'self_run_service',
    shipping_address: {
      zip: '10012',
      country: 'United States of America',
      country_code: 'US',
      address: 'Washington Square',
      province: 'New York',
      city: 'New york',
      contact_person: 'aaaa',
      port: 'null',
      mobile: {
        area: 'null',
        country: '+1',
        number: '1234567890',
      },
      alternate_address: 'Washington Square Park',
      telephone: {
        area: 'null',
        country: '+1',
        number: 'null',
      },
    },
    create_date: {
      format_date: 'MMM. d, yyyy, HH:mm:ss z.',
      timestamp: '1733821832000',
    },
    shipment_fee: {
      amount: '4.6700',
      currency: 'USD',
    },
    duty_amount: {
      amount: '1.0',
      currency: 'USD',
    },
    dropshipping: 'false',
    biz_code: '1010306',
    pay_step: 'ADVANCE',
    trade_term: 'FOB',
    item_status: 'normal',
    tags: '["dropshipping","ds_waybill"]',
    buyer: {
      immutable_eid: '8s0vvDIbRvbS9hSAK4bUtw==',
      full_name: 'xiaowu bglv',
    },
    product_total_amount: {
      amount: '0.20',
      currency: 'USD',
    },
    carrier: {
      code: 'SEMI_MANAGED_CARRIER_CODE_CHEAPEST',
      name: 'Standard',
    },
    status_action: {
      actions: [
        {
          name: 'view_payment_link',
          value: 'http://xxxxxxx',
          render_name: 'View payment link',
        },
      ],
      status: 'trade_success',
    },
    adjust_amount: {
      amount: '0.0000',
      currency: 'USD',
    },
    total_amount: {
      amount: '4.8700',
      currency: 'USD',
    },
    balance_amount: {
      amount: '0.0000',
      currency: 'USD',
    },
    semi_manage: 'true',
    advance_amount: {
      amount: '4.8700',
      currency: 'USD',
    },
  },
  request_id: '0ba2887315178178017221014',
}

/** cid=8&path=/order/logistics/query */
export const LOGISTICS_QUERY = {
  code: '0',
  value: {
    logistic_status: 'CONFIRM_RECEIPT',
    shipping_order_list: [
      {
        voucher: {
          tracking_number: '123432',
          service_provider: 'EX_ASP_OCEAN_EXPRESS',
          logistics_type: 'EXPRESS',
        },
      },
    ],
    shipment_date: {
      format_date: 'Jun. 11, 2024, 20:10:13 PDT.',
      timestamp: '1718161813000',
    },
  },
  request_id: '0ba2887315178178017221014',
}

/** cid=11&path=/alibaba/icbu/category/get/v2 */
export const CATEGORY_LIST_V2 = {
  msg_code: 'null',
  code: '0',
  data: [
    {
      leaf_category: 'true',
      category_name: 'Agriculture',
      category_id: '1',
      level: '1',
    },
  ],
  success: 'true',
  message: 'null',
  request_id: '0ba2887315178178017221014',
}

/** cid=1&path=/icbu/product/category/get */
export const CATEGORY_GET_NEW = {
  result: {
    result: {
      leaf_category: 'false',
      cn_name: '空调系统',
      category_id: '127686030',
      level: '2',
      name: 'Air Conditioning Systems',
      parent_ids: '34',
      child_ids: [127726267, 127696028, 127726266, 127684039, 127680042, 127684049],
    },
    response_code: '200',
    success: 'true',
    response_msg: 'success',
  },
  code: '0',
  request_id: '0ba2887315178178017221014',
}

/** cid=4&path=/auth/token/create */
export const TOKEN_CREATE = {
  access_token: '50000601c30atpedfgu3LVvik87Ixlsvle3mSoB7701ceb156fPunYZ43GBg',
  country: 'sg',
  refresh_token: '500016000300bwa2WteaQyfwBMnPxurcA0mXGhQdTt18356663CfcDTYpWoi',
  account_id: '7063844',
  code: '0',
  user_info: {
    country: 'GLOBAL',
    loginId: 'aliqatest11',
    user_id: '1001',
    seller_id: '1001',
  },
  account_platform: 'seller_center',
  refresh_expires_in: '60',
  expires_in: '10',
  request_id: '0ba2887315178178017221014',
  account: 'xxx@126.com',
}
