import { vi } from 'vitest';

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
