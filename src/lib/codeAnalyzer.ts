import fs from 'fs';
import path from 'path';
import { chat } from './openai';
import { ANALYZE_SYSTEM, analyzeUserPrompt } from './prompts';
import { AnalysisResultSchema, parseAIResponse } from './schemas';

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
      const fullPath = path.join(dir, item);
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

function readKeyFiles(dir: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Read known key files
  for (const keyFile of KEY_FILES) {
    const fullPath = path.join(dir, keyFile);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        result[keyFile] = content.substring(0, 3000); // limit size
      } catch {
        // skip
      }
    }
  }

  // Read a few entry-point source files
  const tree = walkDir(dir);
  const codeFiles = tree.filter(
    (e) => e.type === 'file' && CODE_EXTENSIONS.has(path.extname(e.path))
  );

  // Take the first 5 code files as samples
  for (const codeFile of codeFiles.slice(0, 5)) {
    const fullPath = path.join(dir, codeFile.path);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      result[codeFile.path] = content.substring(0, 2000);
    } catch {
      // skip
    }
  }

  return result;
}

export type { AnalysisResult } from './schemas';

export async function analyzeCodebase(
  projectPath: string,
  onProgress?: (message: string) => void,
): Promise<import('./schemas').AnalysisResult> {
  onProgress?.('Reading project structure...');
  const tree = walkDir(projectPath);

  onProgress?.(`Reading key files (${tree.filter(e => e.type === 'file').length} files found)...`);
  const keyFiles = readKeyFiles(projectPath);

  const treeStr = tree.map((e) => {
    const icon = e.type === 'directory' ? '📁' : '📄';
    return `${icon} ${e.path}`;
  }).join('\n');

  const filesStr = Object.entries(keyFiles)
    .map(([name, content]) => `--- ${name} ---\n${content}`)
    .join('\n\n');

  onProgress?.('Sending to Gemini AI for analysis...');
  const response = await chat(ANALYZE_SYSTEM, analyzeUserPrompt(treeStr, filesStr), { temperature: 0.4, maxTokens: 8192 });

  onProgress?.('Parsing and validating response...');
  return parseAIResponse(response, AnalysisResultSchema);
}
