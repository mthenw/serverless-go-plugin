const util = require("util");
const exec = util.promisify(require("child_process").exec);
const AdmZip = require("adm-zip");
const merge = require("lodash.merge");
const pMap = require("p-map");
const os = require("os");
const prettyHrtime = require("pretty-hrtime");
const chalk = require("chalk");
const path = require("path");
const glob = require("glob");

const ConfigDefaults = {
  baseDir: ".",
  binDir: ".bin",
  cgo: 0,
  cmd: 'GOOS=linux go build -ldflags="-s -w"',
};

const GoRuntime = "go1.x";
const ProvidedRuntime = "provided";

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

  async packageFunctionAsCustomRuntime(name, binPath, outDir) {
    const zip = new AdmZip();
    // AWS discards handler property and looks for `bootstrap` file
    zip.addLocalFile(binPath, "");
    const packageConfig = this.serverless.service.functions[name].package;
    if (packageConfig && packageConfig.include) {
      packageConfig.include.forEach((globFilePath) => {
        const files = glob.sync(globFilePath, {});
        files.forEach((filePath) => {
          const path = filePath.split("/");
          const dir = path.splice(0, path.length - 1).join("/");
          zip.addLocalFile(filePath, dir);
        });
      });
    }

    const outPath = path.join(outDir, name + ".zip");
    await zip.writeZipPromise(outPath, {});

    this.serverless.service.functions[name].package = {
      artifact: outPath,
    };
  }

  packageFunction(name, binPath) {
    const packageConfig = {
      individually: true,
      exclude: [`./**`],
      include: [binPath],
    };
    if (this.serverless.service.functions[name].package) {
      packageConfig.include = packageConfig.include.concat(
        this.serverless.service.functions[name].package.include
      );
    }
    this.serverless.service.functions[name].package = packageConfig;
  }

  compileFunctionAndIgnorePackage() {
    this.isInvoking = true;
    return this.compileFunction();
  }

  // binPath is based on cwd no baseDir
  getCompileBinPath(name, config, isGoRuntimeProvided) {
    const absHandler = path.resolve(config.baseDir);
    const absBin = path.resolve(config.binDir);

    if (isGoRuntimeProvided) {
      return path.join(path.relative(absHandler, absBin), name, "bootstrap");
    }

    return path.join(path.relative(absHandler, absBin), name);
  }

  async compile(name, func) {
    const config = this.getConfig();

    const runtime = func.runtime || this.serverless.service.provider.runtime;
    const goCustomRuntime = func.goCustomRuntime || config.goCustomRuntime;
    const isGoRuntimeProvided = runtime === ProvidedRuntime && goCustomRuntime;
    if (!isGoRuntimeProvided && runtime !== GoRuntime) {
      return;
    }

    const compileBinPath = this.getCompileBinPath(
      name,
      config,
      goCustomRuntime
    );
    try {
      const [env, command] = parseCommand(
        `${config.cmd} -o ${compileBinPath} ${func.handler}`
      );
      await exec(command, {
        cwd: config.baseDir,
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
          `Error compiling "${name}" function (cwd: ${config.baseDir}): ${e.message}`
        )}`
      );
      process.exit(1);
    }

    let binPath = path.join(config.binDir, name);
    if (isGoRuntimeProvided) {
      binPath = path.join(binPath, "bootstrap");
    }
    if (process.platform === "win32") {
      binPath = binPath.replace(/\\/g, "/");
    }
    this.serverless.service.functions[name].handler = binPath;

    if (isGoRuntimeProvided) {
      await this.packageFunctionAsCustomRuntime(name, binPath, config.binDir);
      return;
    }

    this.packageFunction(name, binPath);
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
