const Seneca = require('seneca')

Seneca({ legacy: false })
  .test()
  .use('promisify')
  .use('entity')
  .use('env', {
    // debug: true,
    file: [__dirname + '/local-env.js;?'],
    var: {
      $TANGOCARD_KEY: String,
      $TANGOCARD_NAME: String,
    }
  })
  .use('provider', {
    provider: {
      tangocard: {
        keys: {
          key: { value: '$TANGOCARD_KEY' },
          name: { value: '$TANGOCARD_NAME' },
        }
      }
    }
  })
  .use('../')
  .ready(async function() {
    const seneca = this

    console.log('SDK:', seneca.export('TangocardProvider/sdk')())

    console.log(await seneca.post('sys:provider,provider:tangocard,get:info'))
    
    const list = await seneca.entity("provider/tangocard/board").list$()
    console.log(list.slice(0,3))
  })

