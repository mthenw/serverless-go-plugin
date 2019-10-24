const util = require('util')
const exec = util.promisify(require('child_process').exec)
const merge = require('lodash.merge')
const pMap = require('p-map')
const os = require('os')
const prettyHrtime = require('pretty-hrtime')
const chalk = require('chalk')
const path = require('path')

const ConfigDefaults = {
  baseDir: '.',
  binDir: '.bin',
  cmd: 'GOOS=linux go build -ldflags="-s -w"'
}

const GoRuntime = 'go1.x'

module.exports = class Plugin {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options || {}
    this.isInvoking = false

    this.hooks = {
      'before:deploy:function:packageFunction': this.compileFunction.bind(this),
      'before:package:createDeploymentArtifacts': this.compileFunctions.bind(this),
      // Because of https://github.com/serverless/serverless/blob/master/lib/plugins/aws/invokeLocal/index.js#L361
      // plugin needs to compile a function and then ignore packaging.
      'before:invoke:local:invoke': this.compileFunctionAndIgnorePackage.bind(this)
    }
  }

  async compileFunction() {
    const name = this.options.function
    const func = this.serverless.service.functions[this.options.function]

    const timeStart = process.hrtime()
    await this.compile(name, func)
    const timeEnd = process.hrtime(timeStart)

    this.serverless.cli.consoleLog(`Go Plugin: ${chalk.yellow(`Compilation time (${name}): ${prettyHrtime(timeEnd)}`)}`)
  }

  async compileFunctions() {
    if (this.isInvoking) {
      return
    }

    let names = Object.keys(this.serverless.service.functions)

    const timeStart = process.hrtime()
    await pMap(
      names,
      async name => {
        const func = this.serverless.service.functions[name]
        await this.compile(name, func)
      },
      { concurrency: os.cpus().length }
    )
    const timeEnd = process.hrtime(timeStart)

    this.serverless.cli.consoleLog(`Go Plugin: ${chalk.yellow('Compilation time: ' + prettyHrtime(timeEnd))}`)
  }

  compileFunctionAndIgnorePackage() {
    this.isInvoking = true
    return this.compileFunction()
  }

  async compile(name, func) {
    const config = this.getConfig()

    const runtime = func.runtime || this.serverless.service.provider.runtime
    if (runtime !== GoRuntime) {
      return
    }

    const absHandler = path.resolve(config.baseDir)
    const absBin = path.resolve(config.binDir)
    const compileBinPath = path.join(path.relative(absHandler, absBin), name) // binPath is based on cwd no baseDir
    try {
      await exec(`${config.cmd} -o ${compileBinPath} ${func.handler}`, { cwd: config.baseDir })
    } catch (e) {
      this.serverless.cli.consoleLog(
        `Go Plugin: ${chalk.yellow(`Error compiling "${name}" function (cwd: ${config.baseDir}): ${e.message}`)}`
      )
      process.exit(1)
    }

    const binPath = path.join(config.binDir, name)
    this.serverless.service.functions[name].handler = binPath
    const packageConfig = {
      individually: true,
      exclude: [`./**`],
      include: [binPath]
    }
    if (this.serverless.service.functions[name].package) {
      packageConfig.include = packageConfig.include.concat(this.serverless.service.functions[name].package.include)
    }
    this.serverless.service.functions[name].package = packageConfig
  }

  getConfig() {
    let config = ConfigDefaults
    if (this.serverless.service.custom && this.serverless.service.custom.go) {
      config = merge(config, this.serverless.service.custom.go)
    }
    return config
  }
}
