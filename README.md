# ⚡️Serverless Framework Go Plugin

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

`serverless-go-plugin` is a Serverless Framework plugin that compiles Go functions on the fly. You don't need to do it manually before `serverless deploy`. Once the plugin is installed it will happen automatically.

## Install


1. Install the plugin

    ```
    npm install serverless-go-plugin
    ```

1. Add it to your `serverless.yaml`

    ```
    plugins:
      - serverless-go-plugin
    ```

1. Change every Go function's `handler` to a path to the `*.go` file. E.g.

    ```
    functions:
      example:
        handler: functions/example/main.go
    ```

## Configuration

Default values

```
custom:
  go:
    cmd: GOOS=linux go build -ldflags="-s -w"'
    binDir: .bin
```

## How does it work?

The plugins takes every Go function defined in `serverless.yaml` and compiles it into `.bin` directory. After that it internally changes `handler` so that the Serverless Framework will deploy the compiled file not the source file. The plugin compiles functions with handler pointing to `*.go` file only.

For every matched function it also sets `package` parameter to

```
individually: true,
exclude: [`./**`],
include: [<path to compiled file>]
```
It will happen only if `package` is not defined for a function.