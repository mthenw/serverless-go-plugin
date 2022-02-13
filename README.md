# ⚡️Serverless Framework Go Plugin

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![npm](https://img.shields.io/npm/v/serverless-go-plugin)](https://www.npmjs.com/package/serverless-go-plugin)
[![codecov](https://codecov.io/gh/mthenw/serverless-go-plugin/branch/master/graph/badge.svg)](https://codecov.io/gh/mthenw/serverless-go-plugin)

`serverless-go-plugin` is a Serverless Framework plugin that compiles Go functions on the fly. You don't need to do it manually before `serverless deploy`. Once the plugin is installed it will happen automatically. *The plugin works with Serverless Framework version 1.52 and above.*

### [dev.to: A better way of deploying Go services with Serverless Framework](https://dev.to/mthenw/a-better-way-of-deploying-go-services-with-serverless-framework-41c4)

![output](https://user-images.githubusercontent.com/455261/73918022-fb952e00-48c0-11ea-9120-a7f34ad1ae55.gif)

## Features

- Concurrent compilation happens across all CPU cores.
- Support for both `serverless deploy` and `serverless deploy function` commands.
- Support for `serverless invoke local` command.
- Additional command `serverless go build`.

## Install


1. Install the plugin

    ```
    npm i --save-dev serverless-go-plugin
    ```

1. Add it to your `serverless.yaml`

    ```
    plugins:
      - serverless-go-plugin
    ```

1. Replace every Go function's `handler` with `*.go` file path or a package path. E.g.

    ```
    functions:
      example:
        runtime: go1.x
        handler: functions/example/main.go # or just functions/example
    ```

## Configuration

Default values:

```
custom:
  go:
    baseDir: . # folder where go.mod file lives, if set `handler` property should be set relatively to that folder
    binDir: .bin # target folder for binary files
    cgo: 0 # CGO_ENABLED flag
    cmd: GOOS=linux go build -ldflags="-s -w"' # compile command
    monorepo: false # if enabled, builds function every directory (useful for monorepo where go.mod is managed by each function
    supportedRuntimes: ["go1.x"] # the plugin compiles a function only if runtime is declared here (either on function or provider level) 
    buildProvidedRuntimeAsBootstrap: false # if enabled, builds and archive function with only single "bootstrap" binary (useful for runtimes like provided.al2)
```

## How does it work?

The plugin compiles every Go function defined in `serverless.yaml` into `.bin` directory. After that it internally changes `handler` so that the Serverless Framework will deploy the compiled file not the source file.

For every matched function it also overrides `package` parameter to

```
individually: true
exclude:
  - `./**`
include:
  - `<path to the compiled file and any files that you defined to be included>`
```

## How to run Golang Lambda on ARM?

1. Add `provided.al2` to `supportedRuntimes` and enable `buildProvidedRuntimeAsBootstrap` in plugin config
2. Append `GOARCH=arm64` to your compile command (`cmd` line)
3. Change architecture and runtime in global config:
```yaml
provider:
    architecture: arm64
    runtime: provided.al2
```   

**Warning!** First deploy may result in small downtime (~few seconds) of lambda, use some deployment strategy like canary for safer rollout.
