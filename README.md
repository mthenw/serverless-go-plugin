# ⚡️Serverless Framework Go Plugin

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![npm](https://img.shields.io/npm/v/serverless-go-plugin)](https://www.npmjs.com/package/serverless-go-plugin)
[![codecov](https://codecov.io/gh/mthenw/serverless-go-plugin/branch/master/graph/badge.svg)](https://codecov.io/gh/mthenw/serverless-go-plugin)

`serverless-go-plugin` is a Serverless Framework plugin that compiles Go functions on the fly. You don't need to do it manually before `serverless deploy`. Once the plugin is installed it will happen automatically. The plugin works with Serverless Framework version 1.52 and above.

Features:

- Concurrent compilation happen across all CPU cores.
- Support for both `serverless deploy` and `serverless deploy function` commands.
- Support for `serverless invoke local` command.

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

1. Replace every Go function's `handler` with `*.go` file paths. E.g.

    ```
    functions:
      example:
        handler: functions/example/main.go
    ```

## Configuration

Default values:

```
custom:
  go:
    baseDir: . # folder where go.mod file lives, if set `handler` property should be set relatively to that folder
    binDir: .bin # target folder for binary files
    cmd: GOOS=linux go build -ldflags="-s -w"' # compile command
```

## How does it work?

The plugin compiles every Go function defined in `serverless.yaml` into `.bin` directory. After that it internally changes `handler` so that the Serverless Framework will deploy the compiled file not the source file. The plugin compiles functions only if `handler` property points to `*.go` file.

For every matched function it also sets `package` parameter to

```
individually: true
exclude:
  - `./**`
include:
  - `<path to the compiled file>`
```

It will happen only if `package` is not defined for a function.
