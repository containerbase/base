import { bindingScopeValues, inject, injectable } from 'inversify';
import ipc from 'node-ipc';
import { logger } from '../utils';
import { LinkToolService, type ShellWrapperConfig } from './link-tool.service';
import { PathService } from './path.service';

ipc.config.retry = 1500;
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

  async start(): Promise<void> {
    if (serverRunning) {
      throw new Error('ipc server already started');
    }
    serverRunning = true;
    ipc.serve(`${this.pathSvc.tmpDir}/ipc.sock`);

    ipc.server.on('error', (err: Error) => {
      logger.error({ err }, 'ipc server error');
    });

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

  stop(): void {
    if (!serverRunning) {
      throw new Error('ipc server not started');
    }
    serverRunning = false;
    ipc.server.stop();
  }

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

  async start(): Promise<void> {
    if (clientRunning) {
      throw new Error('ipc client already started');
    }
    clientRunning = true;
    ipc.connectTo(id, `${this.pathSvc.tmpDir}/ipc.sock`);
    const c = ipc.of[id]!;
    const p = new Promise<void>((resolve, reject) => {
      c.on('connect', () => {
        logger.debug('ipc client connected');
        resolve();
      });

      c.on('error', (err: Error) => {
        logger.error({ err }, 'ipc client error');
        reject(err);
      });
    });

    await p;
  }

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

  stop(): void {
    if (!clientRunning) {
      throw new Error('ipc client not started');
    }
    clientRunning = false;
    ipc.disconnect(id);
  }
}
