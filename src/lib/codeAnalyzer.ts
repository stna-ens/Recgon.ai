import fs from 'fs';
import path from 'path';
import { ANALYZE_SYSTEM, analyzeUserPrompt, ANALYZE_UPDATE_SYSTEM, analyzeUpdateUserPrompt } from './prompts';
import { AnalysisResultSchema } from './schemas';
import { generateStructuredOutput } from './llm/quality';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '__pycache__',
  '.cache', 'coverage', '.vscode', '.idea', '.DS_Store', 'venv', 'env',
]);

const KEY_FILES = [
  'README.md', 'readme.md', 'README',
  'package.json', 'Cargo.toml', 'pyproject.toml', 'setup.py',
  'go.mod', 'pom.xml', 'build.gradle',
];

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.rb', '.php', '.swift', '.kt', '.c', '.cpp', '.h', '.cs',
  '.vue', '.svelte', '.html', '.css', '.scss',
]);

interface FileEntry {
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

function walkDir(dir: string, prefix = '', depth = 0, maxDepth = 4): FileEntry[] {
  if (depth > maxDepth) return [];
  const entries: FileEntry[] = [];

  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (IGNORED_DIRS.has(item) || item.startsWith('.')) continue;
      const fullPath = path.join(/*turbopackIgnore: true*/ dir, item);
      const relPath = prefix ? `${prefix}/${item}` : item;

      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          entries.push({ path: relPath, type: 'directory' });
          entries.push(...walkDir(fullPath, relPath, depth + 1, maxDepth));
        } else {
          entries.push({ path: relPath, type: 'file', size: stat.size });
        }
      } catch {
        // skip unreadable
      }
    }
  } catch {
    // skip unreadable
  }

  return entries;
}

function classifyFileRole(relPath: string): { role: string; score: number; limit: number } {
  const lower = relPath.toLowerCase();
  const name = path.basename(lower);
  const ext = path.extname(lower);

  if (KEY_FILES.includes(name) || ['readme', 'dockerfile'].includes(name)) {
    return { role: 'project manifest / documentation', score: 100, limit: 4000 };
  }
  if (/^(package-lock|yarn.lock|pnpm-lock|composer.lock|cargo.lock)$/.test(name)) {
    return { role: 'dependency lockfile', score: 15, limit: 1200 };
  }
  if (name.includes('schema') || lower.includes('/migrations/') || lower.includes('supabase')) {
    return { role: 'database schema / persistence contract', score: 92, limit: 3500 };
  }
  if (lower.includes('/api/') || name === 'route.ts' || name === 'route.js') {
    return { role: 'API route / backend workflow', score: 88, limit: 3200 };
  }
  if (/(auth|session|login|register|oauth|permission|access)/.test(lower)) {
    return { role: 'authentication / access control', score: 84, limit: 3200 };
  }
  if (/(billing|stripe|checkout|price|pricing|subscription|quota|usage|plan)/.test(lower)) {
    return { role: 'monetization / usage limits', score: 82, limit: 3200 };
  }
  if (/(llm|ai|prompt|analyz|generator|model|chat|worker|queue)/.test(lower)) {
    return { role: 'AI workflow / product intelligence', score: 80, limit: 3200 };
  }
  if (/(storage|repository|database|db|supabase|prisma)/.test(lower)) {
    return { role: 'storage / data access', score: 78, limit: 3200 };
  }
  if (/(integration|github|analytics|firecrawl|resend|email|webhook|oauth)/.test(lower)) {
    return { role: 'external integration', score: 74, limit: 2800 };
  }
  if (lower.includes('/src/app/') && (name.startsWith('page.') || name.startsWith('layout.'))) {
    return { role: 'user-facing route / product surface', score: 70, limit: 2200 };
  }
  if (lower.includes('/lib/') || lower.includes('/services/') || lower.includes('/tools/')) {
    return { role: 'core domain logic', score: 62, limit: 2600 };
  }
  if (lower.includes('/components/') && ['.tsx', '.jsx', '.vue', '.svelte'].includes(ext)) {
    return { role: 'reusable UI component', score: 42, limit: 1400 };
  }
  if (['.css', '.scss', '.svg'].includes(ext)) {
    return { role: 'visual styling / asset', score: 10, limit: 800 };
  }
  return { role: 'supporting source file', score: 30, limit: 1600 };
}

function readContextPack(dir: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const keyFile of KEY_FILES) {
    const fullPath = path.join(/*turbopackIgnore: true*/ dir, keyFile);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        result[keyFile] = `ROLE: project manifest / documentation\nPATH: ${keyFile}\n\n${content.substring(0, 4000)}`;
      } catch {
        // skip
      }
    }
  }

  const tree = walkDir(dir);
  const codeFiles = tree.filter(
    (e) => e.type === 'file' && CODE_EXTENSIONS.has(path.extname(e.path))
  );

  const scored = codeFiles.map((f) => {
    const classified = classifyFileRole(f.path);
    let score = classified.score;
    const lower = f.path.toLowerCase();
    const name = path.basename(lower);
    if (/^(index|main|app|server|mod)\.[^/]+$/.test(name)) score += 10;
    if (name.startsWith('next.config') || name.startsWith('vite.config') || name.startsWith('tsconfig')) score += 5;
    if (name === 'middleware.ts' || name === 'middleware.js') score += 5;
    const depth = f.path.split('/').length;
    score += Math.max(0, 5 - depth);
    return { ...f, score, role: classified.role, limit: classified.limit };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: typeof scored = [];
  const roleCounts = new Map<string, number>();
  for (const file of scored) {
    const count = roleCounts.get(file.role) ?? 0;
    const roleLimit = file.role.includes('UI component') || file.role.includes('visual') ? 2 : 5;
    if (count >= roleLimit) continue;
    if (selected.length >= 24) break;
    selected.push(file);
    roleCounts.set(file.role, count + 1);
  }

  for (const codeFile of selected) {
    const fullPath = path.join(/*turbopackIgnore: true*/ dir, codeFile.path);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      result[codeFile.path] = `ROLE: ${codeFile.role}\nPATH: ${codeFile.path}\nSIZE_BYTES: ${codeFile.size ?? 'unknown'}\n\n${content.substring(0, codeFile.limit)}`;
    } catch {
      // skip
    }
  }

  return result;
}

export type { AnalysisResult } from './schemas';

export async function analyzeCodebaseUpdate(
  existingAnalysis: import('./schemas').AnalysisResult,
  diffStr: string,
  onProgress?: (message: string) => void,
  appContext?: string,
): Promise<import('./schemas').AnalysisResult> {
  onProgress?.('Analyzing code changes...');
  const analysis = await generateStructuredOutput({
    taskKind: 'codebase_analysis',
    schema: AnalysisResultSchema,
    systemPrompt: ANALYZE_UPDATE_SYSTEM,
    userPrompt: analyzeUpdateUserPrompt(existingAnalysis, diffStr, appContext),
    options: { temperature: 0.4, maxTokens: 16384 },
    qualityProfile: 'analysis',
  });
  onProgress?.('Parsing and validating updated analysis...');
  return analysis;
}

export async function analyzeCodebase(
  projectPath: string,
  onProgress?: (message: string) => void,
  appContext?: string,
): Promise<import('./schemas').AnalysisResult> {
  onProgress?.('Reading project structure...');
  const tree = walkDir(projectPath);

  onProgress?.(`Reading key files (${tree.filter(e => e.type === 'file').length} files found)...`);
  const keyFiles = readContextPack(projectPath);

  const treeStr = tree.map((e) => {
    const icon = e.type === 'directory' ? '📁' : '📄';
    return `${icon} ${e.path}`;
  }).join('\n');

  const filesStr = Object.entries(keyFiles)
    .map(([name, content]) => `--- ${name} ---\n${content}`)
    .join('\n\n');

  onProgress?.('Sending context pack to AI for analysis...');
  const analysis = await generateStructuredOutput({
    taskKind: 'codebase_analysis',
    schema: AnalysisResultSchema,
    systemPrompt: ANALYZE_SYSTEM,
    userPrompt: analyzeUserPrompt(treeStr, filesStr, appContext),
    options: { temperature: 0.4, maxTokens: 16384 },
    qualityProfile: 'analysis',
  });

  onProgress?.('Parsing and validating response...');
  return analysis;
}
