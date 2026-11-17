import { analyze, inspect, pack, preview } from './index';
import { NO_FILE, type ParserSession } from './protocol';

// The one ParserSession (P3 core spec §5.3): the worker runs it, and so does the client in the
// calling thread where `Worker` is missing (jsdom). It keeps the last inspected file's bytes for
// `preview`, `analyze` and `pack`.

export function createParserSession(): ParserSession {
  let file: { name: string; bytes: Uint8Array } | null = null;
  const current = (): { name: string; bytes: Uint8Array } => {
    if (file === null) throw { message: NO_FILE };
    return file;
  };
  return {
    async inspect(fileName, bytes) {
      file = { name: fileName, bytes };
      return inspect(bytes, fileName);
    },
    async preview(table, encoding) {
      const { name, bytes } = current();
      return preview(bytes, name, table, encoding);
    },
    async analyze(mapping, statusDate) {
      const { name, bytes } = current();
      return analyze(bytes, name, mapping, { statusDate });
    },
    async pack(report) {
      const { name, bytes } = current();
      return pack(bytes, name, report);
    },
  };
}
