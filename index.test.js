const proxyquire = require('proxyquire')
const merge = require('lodash.merge')
const sinon = require('sinon')
const chai = require('chai')
const path = require('path')
const expect = chai.expect

chai.use(require('sinon-chai'))

describe('Go Plugin', () => {
  let sandbox
  let execStub
  let Plugin

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    execStub = sandbox.stub().resolves({ stdin: null, stdout: null })
    Plugin = proxyquire('./index.js', {
      util: {
        promisify: () => execStub
      }
    })
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('compiles only Go functions', async () => {
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
              handler: 'functions/func2/main.go'
            },
            testFunc3: {
              name: 'testFunc3',
              runtime: 'go1.x',
              handler: 'functions/func3'
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
    expect(execStub).to.have.been.calledWith(
      `GOOS=linux go build -ldflags="-s -w" -o .bin/testFunc2 functions/func2/main.go`
    )
    expect(config.service.functions.testFunc3.handler).to.equal(`.bin/testFunc3`)
    expect(execStub).to.have.been.calledWith(`GOOS=linux go build -ldflags="-s -w" -o .bin/testFunc3 functions/func3`)
  })

  it('compiles Go function w/ custom command', async () => {
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
              handler: 'functions/func1/main.go'
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
    expect(execStub).to.have.been.calledOnceWith(`go build -o .bin/testFunc1 functions/func1/main.go`)
  })

  it('compiles Go function w/ custom base dir', async () => {
    // given
    const config = merge(
      {
        service: {
          custom: {
            go: {
              baseDir: 'gopath'
            }
          },
          functions: {
            testFunc1: {
              name: 'testFunc1',
              runtime: 'go1.x',
              handler: 'functions/func1/main.go'
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
    expect(execStub).to.have.been.calledOnceWith(
      `GOOS=linux go build -ldflags="-s -w" -o ../.bin/testFunc1 functions/func1/main.go`,
      { cwd: 'gopath' }
    )
  })

  it('compiles Go function w/ global runtime defined', async () => {
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
              handler: 'functions/func1/main.go'
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

  it('compiles Go function and package them individually', async () => {
    // given
    const config = merge(
      {
        service: {
          functions: {
            testFunc1: {
              name: 'testFunc1',
              runtime: 'go1.x',
              handler: 'functions/func1/main.go'
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

  it('compiles Go function and package them individually only if not configured otherwise', async () => {
    // given
    const config = merge(
      {
        service: {
          functions: {
            testFunc1: {
              name: 'testFunc1',
              runtime: 'go1.x',
              handler: 'functions/func1/main.go',
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

  it('exits if compilation fails', async () => {
    // given
    execStub.throws()
    sandbox.stub(process, 'exit')
    const config = merge(
      {
        service: {
          functions: {
            testFunc1: {
              name: 'testFunc1',
              runtime: 'go1.x',
              handler: 'functions/func1/error.go'
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
    expect(process.exit).to.have.been.called
  })

  it('compiles single Go function', async () => {
    // given
    const config = merge(
      {
        service: {
          functions: {
            testFunc1: {
              name: 'testFunc1',
              runtime: 'go1.x',
              handler: 'functions/func1/main.go'
            }
          }
        }
      },
      serverlessStub
    )
    const plugin = new Plugin(config, { function: 'testFunc1' })

    // when
    await plugin.hooks['before:deploy:function:packageFunction']()

    // then
    expect(execStub).to.have.been.calledOnceWith(
      `GOOS=linux go build -ldflags="-s -w" -o .bin/testFunc1 functions/func1/main.go`
    )
  })
})

const serverlessStub = {
  service: {
    service: 'testService',
    functions: {}
  },
  cli: {
    consoleLog() {}
  }
}
