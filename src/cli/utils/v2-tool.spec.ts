import { describe, expect, test } from 'vitest';
import { isKnownV2Tool, isNotKnownV2Tool, v2Tool } from './v2-tool';

describe('cli/utils/v2-tool', () => {
  @v2Tool('test-tool')
  class TestTool {
    readonly name = 'test-tool';
  }

  const tool = new TestTool().name;

  test('isKnownV2Tool', () => {
    expect(isKnownV2Tool(tool)).toBe(true);
  });

  test('isNotKnownV2Tool', () => {
    expect(isNotKnownV2Tool(tool)).toBe(false);
  });
});
