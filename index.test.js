const proxyquire = require('proxyquire')
const merge = require('lodash.merge')
const sinon = require('sinon')
const chai = require('chai')
const expect = chai.expect

chai.use(require('sinon-chai'))

describe('Go Plugin', () => {
  let sandbox
  let execStub
  let Plugin

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    execStub = sinon.stub().resolves({ stdin: null, stdout: null })
    Plugin = proxyquire('./index.js', {
      util: {
        promisify: () => execStub
      }
    })
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('compile only Go function', async () => {
    // given
    const config = merge(
      {
        service: {
          functions: {
            testFunc1: {
              name: 'testFunc1',
              runtime: 'nodejs10.x',
              handler: 'functions/func1'
            },
            testFunc2: {
              name: 'testFunc2',
              runtime: 'go1.x',
              handler: 'functions/func2'
            }
          }
        }
      },
      serverlessStub
    )
    const plugin = new Plugin(config)

    // when
    await plugin.hooks['before:package:createDeploymentArtifacts']()

    // then
    expect(config.service.functions.testFunc2.handler).to.equal(`.bin/testFunc2`)
    expect(execStub).to.have.been.calledOnceWith(
      `GOOS=linux go build -ldflags="-s -w" -o .bin/testFunc2 functions/func2`
    )
  })

  it('compile Go function w/ custom command', async () => {
    // given
    const config = merge(
      {
        service: {
          custom: {
            go: {
              cmd: 'go build'
            }
          },
          functions: {
            testFunc1: {
              name: 'testFunc1',
              runtime: 'go1.x',
              handler: 'functions/func1'
            }
          }
        }
      },
      serverlessStub
    )
    const plugin = new Plugin(config)

    // when
    await plugin.hooks['before:package:createDeploymentArtifacts']()

    // then
    expect(execStub).to.have.been.calledOnceWith(`go build -o .bin/testFunc1 functions/func1`)
  })

  it('compile Go function w/ global runtime defined', async () => {
    // given
    const config = merge(
      {
        service: {
          provider: {
            runtime: 'go1.x'
          },
          functions: {
            testFunc1: {
              name: 'testFunc1',
              handler: 'functions/func1'
            }
          }
        }
      },
      serverlessStub
    )
    const plugin = new Plugin(config)

    // when
    await plugin.hooks['before:package:createDeploymentArtifacts']()

    // then
    expect(execStub).to.have.been.calledOnce
  })

  it('compile Go function and package them individually', async () => {
    // given
    const config = merge(
      {
        service: {
          functions: {
            testFunc1: {
              name: 'testFunc1',
              runtime: 'go1.x',
              handler: 'functions/func1'
            }
          }
        }
      },
      serverlessStub
    )
    const plugin = new Plugin(config)

    // when
    await plugin.hooks['before:package:createDeploymentArtifacts']()

    // then
    expect(config.service.functions.testFunc1.package).to.deep.equal({
      individually: true,
      exclude: [`./**`],
      include: [`.bin/testFunc1`]
    })
  })

  it('compile Go function and package them individually only if not configured otherwise', async () => {
    // given
    const config = merge(
      {
        service: {
          functions: {
            testFunc1: {
              name: 'testFunc1',
              runtime: 'go1.x',
              handler: 'functions/func1',
              package: {
                exclude: [],
                include: []
              }
            }
          }
        }
      },
      serverlessStub
    )
    const plugin = new Plugin(config)

    // when
    await plugin.hooks['before:package:createDeploymentArtifacts']()

    // then
    expect(config.service.functions.testFunc1.package).to.deep.equal({
      exclude: [],
      include: []
    })
  })
})

const serverlessStub = {
  service: {
    service: 'testService',
    functions: {}
  },
  cli: {
    log(params) {
      return params
    }
  }
}
