import { describe, expect, test } from 'vitest';
import { parseChecksum } from '../../tools/tool-versions.ts';

const digest = 'a'.repeat(128);
const fileName = 'tool-versions-1.2.1.tar.xz';

describe('tools/tool-versions', () => {
  test.each([
    { name: 'a bare digest', content: digest },
    { name: 'a bare digest with a newline', content: `${digest}\n` },
    { name: 'a record', content: `${digest}  ${fileName}\n` },
    { name: 'a binary mode record', content: `${digest} *${fileName}` },
  ])('reads the digest of $name', ({ content }) => {
    expect(parseChecksum(content, fileName)).toBe(digest);
  });

  test('rejects a record of another file', () => {
    expect(() => parseChecksum(`${digest}  other.tar.xz`, fileName)).toThrow(
      `The checksum is for other.tar.xz, not ${fileName}`,
    );
  });
});
