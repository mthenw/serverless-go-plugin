const util = require('util')
const exec = util.promisify(require('child_process').exec)
const merge = require('lodash.merge')

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

    for (let name in this.serverless.service.functions) {
      const func = this.serverless.service.functions[name]
      const runtime = func.runtime || this.serverless.service.provider.runtime
      if (runtime !== GoRuntime) {
        continue
      }

      const binPath = `${config.binDir}/${name}`
      await exec(`${config.cmd} -o ${binPath} ${func.handler}`)

      this.serverless.service.functions[name].handler = binPath
      if (!this.serverless.service.functions[name].package) {
        this.serverless.service.functions[name].package = {
          individually: true,
          exclude: [`./**`],
          include: [binPath]
        }
      }
    }
  }
}
