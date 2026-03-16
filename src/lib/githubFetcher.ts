import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

export async function cloneGitHubRepo(url: string, projectId: string): Promise<string> {
  // Clean URL to prevent command injection
  const cleanUrl = url.trim();
  if (!cleanUrl.startsWith('https://github.com/')) {
    throw new Error('Invalid GitHub URL. Must start with https://github.com/');
  }

  // Create a unique temporary directory for this project
  const tmpDir = path.join(os.tmpdir(), `pmai-repos-${projectId}`);
  
  // Clean up if it somehow exists
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Clone with depth=1 to save time and bandwidth
  try {
    const command = `git clone --depth 1 ${cleanUrl} ${tmpDir}`;
    await execAsync(command);
    
    // Remove the .git folder so we don't analyze git history/objects
    const gitFolder = path.join(tmpDir, '.git');
    if (fs.existsSync(gitFolder)) {
      fs.rmSync(gitFolder, { recursive: true, force: true });
    }
    
    return tmpDir;
  } catch (error) {
    throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
