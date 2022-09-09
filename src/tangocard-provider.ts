/* Copyright © 2022 Seneca Project Contributors, MIT License. */

const Pkg = require('../package.json')

const Tangocard = require('tangocard')


type TangocardProviderOptions = {}

function TangocardProvider(this: any, _options: TangocardProviderOptions) {
  const seneca: any = this

  const entityBuilder = this.export('provider/entityBuilder')


  seneca
    .message('sys:provider,provider:tangocard,get:info', get_info)


  async function get_info(this: any, _msg: any) {
    return {
      ok: true,
      name: 'tangocard',
      version: Pkg.version,
      sdk: {
        name: 'tangocard',
        version: Pkg.dependencies['tangocard'],
      }
    }
  }


  entityBuilder(this, {
    provider: {
      name: 'tangocard'
    },
    entity: {
      board: {
        cmd: {
          list: {
            action: async function(this: any, entize: any, msg: any) {
              let q = msg.q || {}
              let member = q.member || 'me'
              let res = await this.shared.sdk.getBoards(member)
              let list = res.map((data: any) => entize(data))
              return list
            }
          },

          load: {
            action: async function(this: any, entize: any, msg: any) {
              let q = msg.q || {}
              let id = q.id

              try {
                let res = await this.shared.sdk.getBoard(id)
                return entize(res)
              }
              catch (e: any) {
                if (e.message.includes('invalid id')) {
                  return null
                }
                else {
                  throw e
                }
              }
            }
          },

          save: {
            action: async function(this: any, entize: any, msg: any) {
              let ent = msg.ent
              try {
                let res
                if (ent.id) {
                  // TODO: util to handle more fields
                  res = await this.shared.sdk.updateBoard(ent.id, {
                    desc: ent.desc
                  })
                }
                else {
                  // TODO: util to handle more fields
                  let fields = {
                    name: ent.name,
                    desc: ent.desc,
                  }
                  res = await this.shared.sdk.addBoard(fields)
                }

                return entize(res)
              }
              catch (e: any) {
                if (e.message.includes('invalid id')) {
                  return null
                }
                else {
                  throw e
                }
              }
            }
          }

        }
      }
    }
  })

  seneca.prepare(async function(this: any) {
    // TODO: define sys:provider,get:keys to get all the keys?

    let apikey =
      await this.post('sys:provider,get:key,provider:tangocard,key:apikey')
    let usertoken =
      await this.post('sys:provider,get:key,provider:tangocard,key:usertoken')

    this.shared.sdk = new Tangocard(apikey.value, usertoken.value)
  })


  return {
    exports: {
      sdk: () => this.shared.sdk
    }
  }
}


// Default options.
const defaults: TangocardProviderOptions = {

  // TODO: Enable debug logging
  debug: false
}


Object.assign(TangocardProvider, { defaults })

export default TangocardProvider

if ('undefined' !== typeof (module)) {
  module.exports = TangocardProvider
}
