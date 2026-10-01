import { Writable } from 'node:stream';
import { vi } from 'vitest';

/**
 * A writable stream which collects everything written to it, so cli output can
 * be asserted on.
 */
export class StdoutMock extends Writable {
  private readonly chunks: string[] = [];

  get output(): string {
    return this.chunks.join('');
  }

  override _write(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(String(chunk));
    callback();
  }
}

export function spyable(): ClassDecorator {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  return <T extends Function>(target: T): T | void => {
    let proto = target.prototype;
    while (
      proto &&
      proto !== Function.prototype &&
      proto !== Object.prototype
    ) {
      Object.getOwnPropertyNames(proto).forEach((key) => {
        if (key !== 'constructor' && typeof proto[key] === 'function') {
          target.prototype[key] = vi.spyOn(proto, key);
        }
      });
      proto = Object.getPrototypeOf(proto);
    }
    return target;
  };
}
