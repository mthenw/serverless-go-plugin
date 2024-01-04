const util = require("util");
const exec = util.promisify(require("child_process").exec);
const merge = require("lodash.merge");
const pMap = require("p-map");
const os = require("os");
const prettyHrtime = require("pretty-hrtime");
const chalk = require("chalk");
const path = require("path");
const AdmZip = require("adm-zip");
const glob = require("glob");
const { readFileSync } = require("fs");

const ConfigDefaults = {
  baseDir: ".",
  binDir: ".bin",
  cgo: 0,
  cmd: 'GOOS=linux go build -ldflags="-s -w"',
  monorepo: false,
  supportedRuntimes: ["go1.x"],
  buildProvidedRuntimeAsBootstrap: false,
};

// amazonProvidedRuntimes contains Amazon Linux runtimes. Update this array after each new version release.
const amazonProvidedRuntimes = ["provided.al2", "provided.al2023"];

module.exports = class Plugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.isInvoking = false;

    this.hooks = {
      "before:deploy:function:packageFunction": this.compileFunction.bind(this),
      "before:package:createDeploymentArtifacts": this.compileFunctions.bind(
        this
      ),
      // Because of https://github.com/serverless/serverless/blob/master/lib/plugins/aws/invokeLocal/index.js#L361
      // plugin needs to compile a function and then ignore packaging.
      "before:invoke:local:invoke": this.compileFunctionAndIgnorePackage.bind(
        this
      ),
      "go:build:build": this.compileFunctions.bind(this),
    };

    this.commands = {
      go: {
        usage: "Manage Go functions",
        lifecycleEvents: ["go"],
        commands: {
          build: {
            usage: "Build all Go functions",
            lifecycleEvents: ["build"],
          },
        },
      },
    };
  }

  async compileFunction() {
    const name = this.options.function;
    const func = this.serverless.service.functions[this.options.function];

    const timeStart = process.hrtime();
    await this.compile(name, func);
    const timeEnd = process.hrtime(timeStart);

    this.serverless.cli.consoleLog(
      `Go Plugin: ${chalk.yellow(
        `Compilation time (${name}): ${prettyHrtime(timeEnd)}`
      )}`
    );
  }

  async compileFunctions() {
    if (this.isInvoking) {
      return;
    }

    let names = Object.keys(this.serverless.service.functions);

    const timeStart = process.hrtime();
    await pMap(
      names,
      async (name) => {
        const func = this.serverless.service.functions[name];
        await this.compile(name, func);
      },
      { concurrency: os.cpus().length }
    );
    const timeEnd = process.hrtime(timeStart);

    this.serverless.cli.consoleLog(
      `Go Plugin: ${chalk.yellow("Compilation time: " + prettyHrtime(timeEnd))}`
    );
  }

  compileFunctionAndIgnorePackage() {
    this.isInvoking = true;
    return this.compileFunction();
  }

  async compile(name, func) {
    const config = this.getConfig();

    const runtime = func.runtime || this.serverless.service.provider.runtime;
    if (!config.supportedRuntimes.includes(runtime)) {
      return;
    }

    const absHandler = path.resolve(config.baseDir);
    const absBin = path.resolve(config.binDir);
    let compileBinPath = path.join(path.relative(absHandler, absBin), name); // binPath is based on cwd no baseDir
    let cwd = config.baseDir;
    let handler = func.handler;
    if (config.monorepo) {
      if (func.handler.endsWith(".go")) {
        cwd = path.relative(absHandler, path.dirname(func.handler));
        handler = path.basename(handler);
      } else {
        cwd = path.relative(absHandler, func.handler);
        handler = ".";
      }
      compileBinPath = path.relative(cwd, compileBinPath);
    }
    try {
      const [env, command] = parseCommand(
        `${config.cmd} -o ${compileBinPath} ${handler}`
      );
      await exec(command, {
        cwd: cwd,
        env: Object.assign(
          {},
          process.env,
          { CGO_ENABLED: config.cgo.toString() },
          env
        ),
      });
    } catch (e) {
      this.serverless.cli.consoleLog(
        `Go Plugin: ${chalk.yellow(
          `Error compiling "${name}" function (cwd: ${cwd}): ${e.message}`
        )}`
      );
      process.exit(1);
    }

    let binPath = path.join(config.binDir, name);
    if (process.platform === "win32") {
      binPath = binPath.replace(/\\/g, "/");
    }
    this.serverless.service.functions[name].handler = binPath;
    const packageConfig = this.generatePackageConfig(
      runtime,
      config,
      binPath,
      this.serverless.service.functions[name].package &&
        this.serverless.service.functions[name].package.include
        ? this.serverless.service.functions[name].package.include
        : []
    );

    this.serverless.service.functions[name].package = packageConfig;
  }

  generatePackageConfig(runtime, config, binPath, includes) {
    if (
      config.buildProvidedRuntimeAsBootstrap &&
      amazonProvidedRuntimes.includes(runtime)
    ) {
      const zip = new AdmZip();
      zip.addFile("bootstrap", readFileSync(binPath), "", 0o755);
      for (let i = 0; i < includes.length; i++) {
        const files = glob.sync(includes[i]);
        files.forEach((file) => {
          const entryName = path.dirname(file);
          zip.addLocalFile(file, entryName);
        });
      }
      const zipPath = binPath + ".zip";
      zip.writeZip(zipPath);
      return {
        individually: true,
        artifact: zipPath,
      };
    }
    return {
      individually: true,
      exclude: [`./**`],
      include: [binPath].concat(includes),
    };
  }

  getConfig() {
    let config = ConfigDefaults;
    if (this.serverless.service.custom && this.serverless.service.custom.go) {
      config = merge(config, this.serverless.service.custom.go);
    }
    return config;
  }
};

const envSetterRegex = /^(\w+)=('(.*)'|"(.*)"|(.*))/;
function parseCommand(cmd) {
  const args = cmd.split(" ");
  const envSetters = {};
  let command = "";
  for (let i = 0; i < args.length; i++) {
    const match = envSetterRegex.exec(args[i]);
    if (match) {
      let value;
      if (typeof match[3] !== "undefined") {
        value = match[3];
      } else if (typeof match[4] === "undefined") {
        value = match[5];
      } else {
        value = match[4];
      }

      envSetters[match[1]] = value;
    } else {
      command = args.slice(i).join(" ");
      break;
    }
  }

  return [envSetters, command];
}
