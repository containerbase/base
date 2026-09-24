import { bindingScopeValues, inject, injectable } from 'inversify';
import ipc from 'node-ipc';
import { logger, pathExists } from '../utils/index.ts';
import {
  LinkToolService,
  type ShellWrapperConfig,
} from './link-tool.service.ts';
import { PathService } from './path.service.ts';

const maxTries = 3;
ipc.config.retry = 1500;
ipc.config.maxRetries = maxTries;
ipc.config.logInColor = false;
ipc.config.logger = (msg) => {
  logger.trace('ipc log: %s', msg);
};

const id = 'containerbase';

let serverRunning = false;
let clientRunning = false;

interface LinkToolIpcMessage {
  tool: string;
  config: ShellWrapperConfig;
}

@injectable(bindingScopeValues.Singleton)
export class IpcServer {
  @inject(LinkToolService)
  private readonly _link!: LinkToolService;

  @inject(PathService)
  private pathSvc!: PathService;

  /**
   * Starts the ipc server on `ipc.sock` in the temp folder, which links tools
   * for the legacy shell installers.
   *
   * @throws when the server already runs
   */
  async start(): Promise<void> {
    if (serverRunning) {
      throw new Error('ipc server already started');
    }
    serverRunning = true;
    ipc.serve(`${this.pathSvc.tmpDir}/ipc.sock`);

    /* v8 ignore start -- needs a real socket failure to reach */
    ipc.server.on('error', (err: Error) => {
      logger.error({ err }, 'ipc server error');
    });
    /* v8 ignore stop */

    ipc.server.on('link-tool', (data: LinkToolIpcMessage, client) => {
      logger.debug({ data }, 'link-tool ipc message received');
      void this._linkTool(data, client);
    });

    const p = new Promise<void>((resolve) => {
      ipc.server.on('start', () => {
        logger.debug('ipc server started');
        resolve();
      });
    });

    ipc.server.start();

    await p;
  }

  /**
   * Stops the ipc server.
   *
   * @throws when the server does not run
   */
  stop(): void {
    if (!serverRunning) {
      throw new Error('ipc server not started');
    }
    serverRunning = false;
    ipc.server.stop();
  }

  /** Links the requested tool and reports the result back to the client. */
  private async _linkTool(data: LinkToolIpcMessage, client: any): Promise<any> {
    try {
      await this._link.shellwrapper(data.tool, data.config);
      ipc.server.emit(client, 'done', { success: true });
    } catch (error) {
      logger.error({ err: error }, 'ipc link-tool error');
      ipc.server.emit(client, 'done', { success: false });
    }
  }
}

@injectable(bindingScopeValues.Singleton)
export class IpcClient {
  @inject(PathService)
  private pathSvc!: PathService;

  /** Whether an ipc server socket exists in the temp folder. */
  async hasServer(): Promise<boolean> {
    return await pathExists(`${this.pathSvc.tmpDir}/ipc.sock`, 'socket');
  }

  /**
   * Connects to the ipc server, retrying a few times.
   *
   * @throws when the client already runs or cannot connect
   */
  async start(): Promise<void> {
    if (clientRunning) {
      throw new Error('ipc client already started');
    }
    clientRunning = true;
    let tries = 1;
    ipc.connectTo(id, `${this.pathSvc.tmpDir}/ipc.sock`);
    const c = ipc.of[id]!;
    const p = new Promise<void>((resolve, reject) => {
      c.on('connect', () => {
        logger.debug('ipc client connected');
        resolve();
      });

      c.on('error', (err: Error) => {
        logger.debug({ err }, 'ipc client error');
        if (++tries >= maxTries) {
          logger.error({ err }, 'ipc client error');
          reject(err);
        }
      });
    });

    await p;
  }

  /** Asks the server to link a tool, resolving to its exit code. */
  async linkTool(tool: string, config: ShellWrapperConfig): Promise<number> {
    const c = ipc.of[id]!;

    const r = new Promise<number>((resolve) => {
      const cb = (data: { success: boolean }): void => {
        logger.debug({ data }, 'ipc client link-tool done');
        c.off('done', cb);
        if (data.success) {
          resolve(0);
        } else {
          resolve(1);
        }
      };
      c.on('done', cb);
    });
    c.emit('link-tool', { tool, config });
    return await r;
  }

  /**
   * Disconnects from the ipc server.
   *
   * @throws when the client does not run
   */
  stop(): void {
    if (!clientRunning) {
      throw new Error('ipc client not started');
    }
    clientRunning = false;
    ipc.disconnect(id);
  }
}
