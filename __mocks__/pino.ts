import { vi } from 'vitest';

export const levels = { values: { info: 30 } };
export const pino = vi.fn().mockReturnValue({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
});
export const transport = vi.fn((a) => a);
