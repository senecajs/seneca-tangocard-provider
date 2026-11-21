/* Copyright © 2022 Seneca Project Contributors, MIT License. */

import * as Fs from 'fs'
import * as Http from 'http'


const Seneca = require('seneca')
const SenecaMsgTest = require('seneca-msg-test')

import TangocardProvider from '../src/tangocard-provider'
import TangocardProviderDoc from '../src/TangocardProvider-doc'

const BasicMessages = require('./basic.messages.js')


// Live tests call the Tango Card RaaS integration API. They need Tango Card
// credentials: test/local-config.js (see local-config-template.js) with the
// keys in test/local-env.js, or the environment variables TANGOCARD_KEY,
// TANGOCARD_NAME, TANGOCARD_CUSTID and TANGOCARD_ACCID. Without them the
// same tests run against a local mock of the RaaS API, and the env plugin
// gets dummy values.
const ENV_VARS =
  ['TANGOCARD_KEY', 'TANGOCARD_NAME', 'TANGOCARD_CUSTID', 'TANGOCARD_ACCID']

const LIVE = Fs.existsSync(__dirname + '/local-config.js') ||
  ENV_VARS.every((n) => !!process.env[n])

if (!LIVE) {
  for (const n of ENV_VARS) {
    process.env[n] ??= 'test-' + n.toLowerCase().replace('tangocard_', '')
  }
}


let mock: MockRaasApi | null = null

beforeAll(async () => {
  if (!LIVE) {
    mock = await makeMockRaasApi()
  }
})

afterAll(async () => {
  if (mock) {
    await mock.close()
  }
})


describe('tangocard-provider', () => {

  test('happy', async () => {
    expect(TangocardProvider).toBeDefined()
    expect(TangocardProviderDoc).toBeDefined()

    const seneca = await makeSeneca()

    expect(await seneca.post('sys:provider,provider:tangocard,get:info'))
      .toMatchObject({
        ok: true,
        name: 'tangocard',
      })

    await seneca.close()
  })


  test('messages', async () => {
    const seneca = await makeSeneca()
    await (SenecaMsgTest(seneca, BasicMessages)())
    await seneca.close()
  })


  test('list-brand', async () => {
    const seneca = await makeSeneca()

    const list = await seneca.entity("provider/tangocard/brand").list$()
    // console.log('BRANDS', list)

    expect(list.length > 0).toBeTruthy()

    if (mock) {
      expect(list[0]).toMatchObject({ brandKey: 'B000001' })
      expect(mock.calls[mock.calls.length - 1]).toEqual({
        method: 'GET',
        url: '/raas/v2/catalogs',
        auth: 'Basic ' + Buffer.from(
          process.env.TANGOCARD_NAME + ':' + process.env.TANGOCARD_KEY
        ).toString('base64'),
        body: undefined,
      })
    }

    await seneca.close()
  })


  test('list-customer', async () => {
    const seneca = await makeSeneca()

    const list = await seneca.entity("provider/tangocard/customer").list$()
    expect(Array.isArray(list)).toBeTruthy()

    if (mock) {
      expect(list.length).toEqual(1)
      expect(list[0]).toMatchObject({
        customerIdentifier: process.env.TANGOCARD_CUSTID
      })
    }

    await seneca.close()
  })


  test('list-order', async () => {
    const seneca = await makeSeneca()

    const list = await seneca.entity("provider/tangocard/order")
      .list$({ elementsPerBlock: 10 })
    expect(Array.isArray(list)).toBeTruthy()
    expect(list.page).toBeDefined()

    if (mock) {
      expect(mock.calls[mock.calls.length - 1].url)
        .toEqual('/raas/v2/orders?elementsPerBlock=10')
    }

    await seneca.close()
  })


  // Places an order, so it runs against the mock only.
  test('save-order', async () => {
    if (LIVE) return;

    const seneca = await makeSeneca()

    let order = await seneca.entity('provider/tangocard/order').data$({
      amount: 10,
      utid: 'U000001',
      externalRefID: 'ref0',
      recipient: {
        email: 'alice@example.com',
        firstName: 'Alice',
        lastName: '',
      },
    }).save$()

    expect(order).toMatchObject({
      id: 'RA261121-0001-01',
      referenceOrderID: 'RA261121-0001-01',
      utid: 'U000001',
      status: 'COMPLETE',
    })

    // The plugin adds the customer and account from the provider keys, and
    // the defaults of the entity.order.save option.
    expect(mock!.calls[mock!.calls.length - 1]).toMatchObject({
      method: 'POST',
      url: '/raas/v2/orders',
      body: {
        customerIdentifier: process.env.TANGOCARD_CUSTID,
        accountIdentifier: process.env.TANGOCARD_ACCID,
        sendEmail: false,
        amount: 10,
        utid: 'U000001',
        externalRefID: 'ref0',
        recipient: {
          email: 'alice@example.com',
          firstName: 'Alice',
          lastName: '',
        },
      }
    })

    await seneca.close()
  })

})


async function makeSeneca() {
  const seneca = Seneca({ legacy: false })
    .test()
    .use('@seneca/entity')
    .use('@seneca/env', {
      // debug: true,
      file: [__dirname + '/local-env.js;?'],
      var: {
        $TANGOCARD_KEY: String,
        $TANGOCARD_NAME: String,
        $TANGOCARD_CUSTID: String,
        $TANGOCARD_ACCID: String,
      }
    })
    .use('@seneca/provider', {
      provider: {
        tangocard: {
          keys: {
            key: { value: '$TANGOCARD_KEY' },
            name: { value: '$TANGOCARD_NAME' },
            cust: { value: '$TANGOCARD_CUSTID' },
            acc: { value: '$TANGOCARD_ACCID' },
          }
        }
      }
    })
    .use(TangocardProvider, {
      ...(mock ? { url: mock.url } : {}),
      entity: {
        order: {
          save: {
            sendEmail: false
          }
        }
      }
    })

  return seneca.ready()
}


type MockCall = {
  method?: string
  url?: string
  auth?: string
  body: any
}

type MockRaasApi = {
  url: string
  calls: MockCall[]
  close: () => Promise<void>
}


// A local stand-in for the Tango Card RaaS API (v2) calls that the plugin
// makes: GET catalogs, GET customers, GET orders and POST orders. The
// responses have the shape of the RaaS API reference, with only a few
// fields.
async function makeMockRaasApi(): Promise<MockRaasApi> {
  const calls: MockCall[] = []

  const server = Http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => body += chunk)
    req.on('end', () => {
      const data = '' === body ? undefined : JSON.parse(body)
      calls.push({
        method: req.method,
        url: req.url,
        auth: req.headers.authorization,
        body: data,
      })

      const path = new URL(req.url || '/', 'http://127.0.0.1').pathname
      const createdAt = '2026-11-21T00:00:00.000Z'

      let status = 200
      let out: any

      if ('GET' === req.method && '/raas/v2/catalogs' === path) {
        out = {
          catalogName: 'Mock Catalog',
          brands: [{
            brandKey: 'B000001',
            brandName: 'Mock Brand',
            status: 'active',
            createdDate: createdAt,
            lastUpdateDate: createdAt,
            items: [{
              utid: 'U000001',
              rewardName: 'Mock Gift Card',
              currencyCode: 'USD',
              status: 'active',
              valueType: 'VARIABLE_VALUE',
              rewardType: 'gift card',
              minValue: 1,
              maxValue: 100,
              countries: ['US'],
            }]
          }]
        }
      }
      else if ('GET' === req.method && '/raas/v2/customers' === path) {
        out = [{
          customerIdentifier: process.env.TANGOCARD_CUSTID,
          displayName: 'Mock Customer',
          status: 'active',
          createdAt,
          accounts: [{
            accountIdentifier: process.env.TANGOCARD_ACCID,
            displayName: 'Mock Account',
            status: 'active',
            createdAt,
          }]
        }]
      }
      else if ('GET' === req.method && '/raas/v2/orders' === path) {
        out = {
          page: {
            number: 0, elementsPerBlock: 10, resultCount: 0, totalCount: 0
          },
          orders: []
        }
      }
      else if ('POST' === req.method && '/raas/v2/orders' === path) {
        status = 201
        out = {
          referenceOrderID: 'RA261121-0001-01',
          externalRefID: data.externalRefID,
          customerIdentifier: data.customerIdentifier,
          accountIdentifier: data.accountIdentifier,
          amountCharged: {
            value: data.amount, currencyCode: 'USD', total: data.amount
          },
          denomination: { value: data.amount, currencyCode: 'USD' },
          utid: data.utid,
          rewardName: 'Mock Gift Card',
          recipient: data.recipient,
          sendEmail: data.sendEmail,
          status: 'COMPLETE',
          createdAt,
        }
      }
      else {
        status = 404
        out = {
          timestamp: createdAt,
          requestId: 'mock',
          path,
          httpCode: 404,
          httpPhrase: 'Not Found',
          message: 'Not Found',
        }
      }

      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(out))
    })
  })

  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()))

  const port = (server.address() as { port: number }).port

  return {
    // NOTE: the plugin option url needs the trailing /
    url: `http://127.0.0.1:${port}/raas/v2/`,
    calls,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
  }
}
