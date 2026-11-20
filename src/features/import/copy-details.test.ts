import { describe, expect, it } from 'vitest';
import { copyDetailsText } from '@/features/import/copy-details';

describe('copyDetailsText', () => {
  it('lists the message, code, file, format and parser version', () => {
    expect(
      copyDetailsText({
        message: 'The file is empty.',
        code: 'FILE_EMPTY',
        fileName: 'a.xer',
        size: 2048,
        format: 'Primavera P6 XER',
        parserVersion: '1.0.0',
      }),
    ).toBe(
      'Message: The file is empty.\nCode: FILE_EMPTY\nFile: a.xer (2.0 KB)\nDetected format: Primavera P6 XER\nParser version: 1.0.0',
    );
    expect(
      copyDetailsText({
        message: 'x',
        code: null,
        fileName: 'b.db',
        size: 10,
        format: null,
        parserVersion: null,
      }),
    ).toBe('Message: x\nFile: b.db (10 B)\nDetected format: none\nParser version: unknown');
  });
});
