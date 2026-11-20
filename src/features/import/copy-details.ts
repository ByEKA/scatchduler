import { fileSize } from '@/lib/format';

export interface CopyDetailsInput {
  message: string;
  code: string | null;
  fileName: string;
  size: number;
  format: string | null;
  parserVersion: string | null;
}

/**
 * Plain-text details copied by "Copy details" on import refusals and errors (spec §5.9).
 * Lines with null `code` are omitted; null `format` reads "none" and null `parserVersion`
 * reads "unknown".
 */
export function copyDetailsText(details: CopyDetailsInput): string {
  const lines = [`Message: ${details.message}`];
  if (details.code !== null) lines.push(`Code: ${details.code}`);
  lines.push(
    `File: ${details.fileName} (${fileSize(details.size)})`,
    `Detected format: ${details.format ?? 'none'}`,
    `Parser version: ${details.parserVersion ?? 'unknown'}`,
  );
  return lines.join('\n');
}
