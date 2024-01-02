const proxyquire = require("proxyquire");
const merge = require("lodash.merge");
const sinon = require("sinon");
const chai = require("chai");
const expect = chai.expect;

chai.use(require("sinon-chai"));

describe("Go Plugin", () => {
  let sandbox;
  let execStub;
  let Plugin;
  let readFileSyncStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    execStub = sandbox.stub().resolves({ stdin: null, stdout: null });
    readFileSyncStub = sinon
      .stub()
      .withArgs(".bin/testFunc1")
      .returns("fake binary content");
    const admZipInstance = {
      addFile: sinon.stub(),
      writeZip: sinon.stub(),
    };
    const admZipStub = sinon.stub().callsFake(() => admZipInstance);
    Plugin = proxyquire("./index.js", {
      fs: { readFileSync: readFileSyncStub },
      "adm-zip": admZipStub,
      util: {
        promisify: () => execStub,
      },
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("`serverless deploy`", () => {
    it("compiles only Go functions", async () => {
      // given
      const config = merge(
        {
          service: {
            functions: {
              testFunc1: {
                name: "testFunc1",
                runtime: "nodejs10.x",
                handler: "functions/func1",
              },
              testFunc2: {
                name: "testFunc2",
                runtime: "go1.x",
                handler: "functions/func2/main.go",
              },
              testFunc3: {
                name: "testFunc3",
                runtime: "go1.x",
                handler: "functions/func3",
              },
            },
          },
        },
        serverlessStub
      );
      const plugin = new Plugin(config);

      // when
      await plugin.hooks["before:package:createDeploymentArtifacts"]();

      // then
      expect(config.service.functions.testFunc2.handler).to.equal(
        `.bin/testFunc2`
      );
      expect(execStub).to.have.been.calledWith(
        `go build -ldflags="-s -w" -o .bin/testFunc2 functions/func2/main.go`
      );
      expect(execStub.firstCall.args[1].cwd).to.equal(".");
      expect(execStub.firstCall.args[1].env.GOOS).to.equal("linux");
      expect(execStub.firstCall.args[1].env.CGO_ENABLED).to.equal("0");
      expect(config.service.functions.testFunc3.handler).to.equal(
        `.bin/testFunc3`
      );
      expect(execStub).to.have.been.calledWith(
        `go build -ldflags="-s -w" -o .bin/testFunc3 functions/func3`
      );
    });

    it("compiles function with supported runtime", async () => {
      // given
      const config = merge(
        {
          service: {
            custom: {
              go: {
                supportedRuntimes: ["go1.x", "provided.al2", "provided.al2023"],
              },
            },
            functions: {
              testFunc1: {
                name: "testFunc1",
                runtime: "provided.al2",
                handler: "functions/func1/main.go",
              },
              testFunc2: {
                name: "testFunc2",
                runtime: "go1.x",
                handler: "functions/func2/main.go",
              },
              testFunc3: {
                name: "testFunc3",
                runtime: "provided.al2023",
                handler: "functions/func3/main.go",
              },
            },
          },
        },
        serverlessStub
      );
      const plugin = new Plugin(config);

      // when
      await plugin.hooks["before:package:createDeploymentArtifacts"]();

      // then
      expect(config.service.functions.testFunc2.handler).to.equal(
        `.bin/testFunc2`
      );
      expect(execStub).to.have.been.calledWith(
        `go build -ldflags="-s -w" -o .bin/testFunc2 functions/func2/main.go`
      );
      expect(config.service.functions.testFunc1.handler).to.equal(
        `.bin/testFunc1`
      );
      expect(execStub).to.have.been.calledWith(
        `go build -ldflags="-s -w" -o .bin/testFunc1 functions/func1/main.go`
      );
      expect(config.service.functions.testFunc3.handler).to.equal(
        `.bin/testFunc3`
      );
      expect(execStub).to.have.been.calledWith(
        `go build -ldflags="-s -w" -o .bin/testFunc3 functions/func3/main.go`
      );
    });

    it("compiles Go function w/ custom command", async () => {
      // given
      const config = merge(
        {
          service: {
            custom: {
              go: {
                cmd: "CGO_ENABLED=1 GOOS=linux go build",
              },
            },
            functions: {
              testFunc1: {
                name: "testFunc1",
                runtime: "go1.x",
                handler: "functions/func1/main.go",
              },
            },
          },
        },
        serverlessStub
      );
      const plugin = new Plugin(config);

      // when
      await plugin.hooks["before:package:createDeploymentArtifacts"]();

      // then
      expect(execStub).to.have.been.calledOnceWith(
        `go build -o .bin/testFunc1 functions/func1/main.go`
      );
      expect(execStub.firstCall.args[1].env.CGO_ENABLED).to.equal("1");
      expect(execStub.firstCall.args[1].env.GOOS).to.equal("linux");
    });

    it("compiles Go function w/ custom base dir", async () => {
      // given
      const config = merge(
        {
          service: {
            custom: {
              go: {
                baseDir: "gopath",
              },
            },
            functions: {
              testFunc1: {
                name: "testFunc1",
                runtime: "go1.x",
                handler: "functions/func1/main.go",
              },
            },
          },
        },
        serverlessStub
      );
      const plugin = new Plugin(config);

      // when
      await plugin.hooks["before:package:createDeploymentArtifacts"]();

      // then
      expect(execStub).to.have.been.calledOnceWith(
        `go build -ldflags="-s -w" -o ../.bin/testFunc1 functions/func1/main.go`
      );
      expect(execStub.firstCall.args[1].cwd).to.equal("gopath");
    });

    it("compiles Go function w/ global runtime defined", async () => {
      // given
      const config = merge(
        {
          service: {
            provider: {
              runtime: "go1.x",
            },
            functions: {
              testFunc1: {
                name: "testFunc1",
                handler: "functions/func1/main.go",
              },
            },
          },
        },
        serverlessStub
      );
      const plugin = new Plugin(config);

      // when
      await plugin.hooks["before:package:createDeploymentArtifacts"]();

      // then
      expect(execStub).to.have.been.calledOnce;
    });

    it("package Go function individually", async () => {
      // given
      const config = merge(
        {
          service: {
            functions: {
              testFunc1: {
                name: "testFunc1",
                runtime: "go1.x",
                handler: "functions/func1/main.go",
              },
            },
          },
        },
        serverlessStub
      );
      const plugin = new Plugin(config);

      // when
      await plugin.hooks["before:package:createDeploymentArtifacts"]();

      // then
      expect(config.service.functions.testFunc1.package).to.deep.equal({
        individually: true,
        exclude: [`./**`],
        include: [`.bin/testFunc1`],
      });
    });

    it("package Go function allowing including more files", async () => {
      // given
      const config = merge(
        {
          service: {
            functions: {
              testFunc1: {
                name: "testFunc1",
                runtime: "go1.x",
                handler: "functions/func1/main.go",
                package: {
                  include: ["somepath"],
                },
              },
            },
          },
        },
        serverlessStub
      );
      const plugin = new Plugin(config);

      // when
      await plugin.hooks["before:package:createDeploymentArtifacts"]();

      // then
      expect(config.service.functions.testFunc1.package).to.deep.equal({
        individually: true,
        exclude: ["./**"],
        include: [`.bin/testFunc1`, "somepath"],
      });
    });

    it("exits if compilation fails", async () => {
      // given
      execStub.throws();
      sandbox.stub(process, "exit");
      const config = merge(
        {
          service: {
            functions: {
              testFunc1: {
                name: "testFunc1",
                runtime: "go1.x",
                handler: "functions/func1/error.go",
              },
            },
          },
        },
        serverlessStub
      );
      const plugin = new Plugin(config);

      // when
      await plugin.hooks["before:package:createDeploymentArtifacts"]();

      // then
      expect(process.exit).to.have.been.called;
    });

    it("compiles single Go function", async () => {
      // given
      const config = merge(
        {
          service: {
            functions: {
              testFunc1: {
                name: "testFunc1",
                runtime: "go1.x",
                handler: "functions/func1/main.go",
              },
            },
          },
        },
        serverlessStub
      );
      const plugin = new Plugin(config, { function: "testFunc1" });

      // when
      await plugin.hooks["before:deploy:function:packageFunction"]();

      // then
      expect(execStub).to.have.been.calledOnceWith(
        `go build -ldflags="-s -w" -o .bin/testFunc1 functions/func1/main.go`
      );
      expect(execStub.firstCall.args[1].cwd).to.equal(".");
    });

    it("compiles Go function w/ monorepo", async () => {
      // given
      const config = merge(
        {
          service: {
            custom: {
              go: {
                monorepo: true,
              },
            },
            functions: {
              testFunc1: {
                name: "testFunc1",
                runtime: "go1.x",
                handler: "functions/func1",
              },
              testFunc2: {
                name: "testFunc2",
                runtime: "go1.x",
                handler: "functions/func2/main.go",
              },
            },
          },
        },
        serverlessStub
      );
      const plugin = new Plugin(config);

      // when
      await plugin.hooks["before:package:createDeploymentArtifacts"]();

      // then
      expect(config.service.functions.testFunc1.handler).to.equal(
        `.bin/testFunc1`
      );
      expect(execStub).to.have.been.calledWith(
        `go build -ldflags="-s -w" -o ../../.bin/testFunc1 .`
      );
      expect(execStub.firstCall.args[1].cwd).to.equal("functions/func1");
      expect(config.service.functions.testFunc2.handler).to.equal(
        `.bin/testFunc2`
      );
      expect(execStub).to.have.been.calledWith(
        `go build -ldflags="-s -w" -o ../../.bin/testFunc2 main.go`
      );
      expect(execStub.secondCall.args[1].cwd).to.equal("functions/func2");
    });

    it("compiles bootstrap", async () => {
      // given
      const config = merge(
        {
          service: {
            custom: {
              go: {
                supportedRuntimes: ["go1.x", "provided.al2", "provided.al2023"],
                buildProvidedRuntimeAsBootstrap: true,
              },
            },
            functions: {
              testFunc1: {
                name: "testFunc1",
                runtime: "provided.al2",
                handler: "functions/func1",
              },
              testFunc2: {
                name: "testFunc2",
                runtime: "go1.x",
                handler: "functions/func1/main.go",
              },
              testFunc3: {
                name: "testFunc3",
                runtime: "provided.al2023",
                handler: "functions/func1",
              },
            },
          },
        },
        serverlessStub
      );
      const plugin = new Plugin(config);

      // when
      await plugin.hooks["before:package:createDeploymentArtifacts"]();

      // then
      expect(config.service.functions.testFunc1.package).to.deep.equal({
        individually: true,
        artifact: ".bin/testFunc1.zip",
      });

      expect(config.service.functions.testFunc2.package).to.deep.equal({
        individually: true,
        exclude: ["./**"],
        include: [".bin/testFunc2"],
      });

      expect(config.service.functions.testFunc3.package).to.deep.equal({
        individually: true,
        artifact: ".bin/testFunc3.zip",
      });
    });
  });

  describe(`serverless go build`, () => {
    it("compiles Go functions", async () => {
      // given
      const config = merge(
        {
          service: {
            functions: {
              testFunc1: {
                name: "testFunc1",
                runtime: "go1.x",
                handler: "functions/func2/main.go",
              },
            },
          },
        },
        serverlessStub
      );
      const plugin = new Plugin(config);

      // when
      await plugin.hooks["go:build:build"]();

      // then
      expect(config.service.functions.testFunc1.handler).to.equal(
        `.bin/testFunc1`
      );
    });
  });
});

const serverlessStub = {
  service: {
    service: "testService",
    functions: {},
  },
  cli: {
    consoleLog() {},
  },
};
