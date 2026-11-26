// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();
async function restrictedImports(filePath, code) {
  const [result] = await eslint.lintText(`${code}\nexport {};\n`, { filePath });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports').length;
}

describe('import boundaries (S7)', () => {
  it.each([
    ['src/import/a.ts', "import { useState } from 'react';", 1],
    ['src/import/a.ts', "import { useNow } from '@/hooks/useNow';", 1],
    ['src/import/a.ts', "import { seed } from '@/data/mock/seed';", 1],
    ['src/import/a.ts', "import type { ImportReport } from '@/data/types';", 0],
    ['src/import/a.ts', "import { foldForMatch } from '@/lib/search';", 0],
    ['src/import/table/csv.ts', "import Papa from 'papaparse';", 0],
    ['src/import/client.ts', "import { analyze } from './index';", 1],
    ['src/import/client.ts', "import type { WorkerRequest } from './protocol';", 0],
    ['src/features/a.tsx', "import { analyze } from '@/import/index';", 1],
    ['src/features/a.tsx', "import { createImportClient } from '@/import/client';", 1],
    ['src/features/a.tsx', "import Papa from 'papaparse';", 1],
    ['src/features/a.tsx', "import { seed } from '@/data/mock/seed';", 1],
    ['src/hooks/a.ts', "import { createImportClient } from '@/import/client';", 0],
    ['src/hooks/a.ts', "import type { InspectOutcome } from '@/import/protocol';", 0],
    ['src/hooks/a.ts', "import { analyze } from '@/import/index';", 1],
    ['src/data/supabase/a.ts', "import { gzipSync } from 'fflate';", 1],
    // Beyond the plan's rows: relative adapter imports, the bare specifiers restricted through
    // `paths`, and parser-library subpaths (eslint.config.js).
    ['src/import/a.ts', "import { seed } from '../data/mock/seed';", 1],
    ['src/import/a.ts', "import { createDataLayer } from '@/data';", 1],
    ['src/hooks/a.ts', "import { analyze } from '@/import';", 1],
    ['src/hooks/a.ts', "import type { AnalyzeOutcome } from '@/import';", 0],
    ['src/features/a.tsx', "import { gzipSync } from 'fflate/browser';", 1],
    // Spec D47: test files outside src/import and src/test may import @/import/** and fixtures,
    // while keeping the adapter boundary.
    ['src/features/import/a.test.tsx', "import { createImportClient } from '@/import/client';", 0],
    ['src/features/import/a.test.tsx', "import { seed } from '@/data/mock/seed';", 1],
    // Phase 4 core engine and Gantt renderer boundaries (spec §3, S7).
    ['src/engine/a.ts', "import { useState } from 'react';", 1],
    ['src/engine/a.ts', "import { useNow } from '@/hooks/useNow';", 1],
    ['src/engine/a.ts', "import { seed } from '@/data/mock/seed';", 1],
    ['src/engine/a.ts', "import type { ScheduleDocument } from '@/data/schedule-types';", 0],
    ['src/engine/a.ts', "import type { ID } from '@/data/types';", 0],
    ['src/engine/a.ts', "import { analyze } from '@/import/index';", 1],
    ['src/engine/a.ts', "import Papa from 'papaparse';", 1],
    ['src/engine/materialize.ts', "import type { ImportModel } from '@/import/model';", 0],
    ['src/engine/materialize.ts', "import { emptyModel } from '@/import/model';", 1],
    ['src/engine/client.ts', "import { solve } from './index';", 1],
    ['src/engine/client.ts', "import type { EngineRequest } from './protocol';", 0],
    ['src/features/a.tsx', "import { createEngineClient } from '@/engine/client';", 1],
    ['src/features/a.tsx', "import type { ResolvedRules } from '@/engine/index';", 0],
    ['src/hooks/a.ts', "import { createEngineClient } from '@/engine/client';", 0],
    ['src/hooks/a.ts', "import { solve } from '@/engine/index';", 1],
    ['src/features/schedule/gantt/renderer.ts', "import { useState } from 'react';", 1],
    ['src/features/schedule/gantt/renderer.ts', "import type { GanttScene } from './renderer';", 0],
    [
      'src/features/schedule/a.test.tsx',
      "import { createEngineClient } from '@/engine/client';",
      0,
    ],
  ])('%s: %s gives %i restricted-import errors', async (filePath, code, errors) => {
    expect(await restrictedImports(filePath, code)).toBe(errors);
  });
});
