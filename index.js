const util = require('util')
const exec = util.promisify(require('child_process').exec)
const merge = require('lodash.merge')
const pMap = require('p-map')
const os = require('os')
const prettyHrtime = require('pretty-hrtime')
const chalk = require('chalk')

const ConfigDefaults = {
  cmd: 'GOOS=linux go build -ldflags="-s -w"',
  binDir: '.bin'
}

const GoRuntime = 'go1.x'

module.exports = class Plugin {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options

    this.hooks = {
      'before:package:createDeploymentArtifacts': this.compile.bind(this)
    }
  }

  async compile() {
    let config = ConfigDefaults
    if (this.serverless.service.custom && this.serverless.service.custom.go) {
      config = merge(config, this.serverless.service.custom.go)
    }

    const names = Object.keys(this.serverless.service.functions)

    const timeStart = process.hrtime()

    await pMap(
      names,
      async name => {
        const func = this.serverless.service.functions[name]

        const runtime = func.runtime || this.serverless.service.provider.runtime
        if (runtime !== GoRuntime) {
          return
        }

        if (!func.handler.match(/\.go$/i)) {
          return
        }

        const binPath = `${config.binDir}/${name}`

        try {
          await exec(`${config.cmd} -o ${binPath} ${func.handler}`)
        } catch (e) {
          this.serverless.cli.consoleLog(
            `Go Plugin: ${chalk.yellow(`Error compiling "${name}" function: ${e.message}`)}`
          )
          process.exit(1)
        }

        this.serverless.service.functions[name].handler = binPath
        if (!this.serverless.service.functions[name].package) {
          this.serverless.service.functions[name].package = {
            individually: true,
            exclude: [`./**`],
            include: [binPath]
          }
        }
      },
      { concurrency: os.cpus().length }
    )

    const timeEnd = process.hrtime(timeStart)
    this.serverless.cli.consoleLog(`Go Plugin: ${chalk.yellow('Compilation time: ' + prettyHrtime(timeEnd))}`)
  }
}
