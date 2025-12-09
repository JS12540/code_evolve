
import { ProjectFile, GitHubConfig, PullRequestResult, GitHubUser, GitHubRepo } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

export const parseRepoUrl = (url: string): { owner: string; repo: string } | null => {
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
    return null;
  } catch {
    return null;
  }
};

const getHeaders = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
});

export const validateToken = async (token: string): Promise<GitHubUser> => {
  const res = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: getHeaders(token)
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Invalid Authorization Key.");
    throw new Error("Failed to connect to GitHub. Check your internet connection.");
  }
  return res.json();
};

export const fetchUserRepos = async (token: string): Promise<GitHubRepo[]> => {
  const res = await fetch(
    `${GITHUB_API_BASE}/user/repos?sort=updated&per_page=100&visibility=all&affiliation=owner,collaborator,organization_member`, 
    { headers: getHeaders(token) }
  );

  if (!res.ok) throw new Error("Failed to fetch repositories.");
  return res.json();
};

export const fetchRepoContents = async (config: GitHubConfig): Promise<ProjectFile[]> => {
  if (!config.owner || !config.repo || !config.token) {
    throw new Error("Missing GitHub configuration");
  }

  // 1. Get default branch
  const repoRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}`, {
    headers: getHeaders(config.token)
  });
  if (!repoRes.ok) throw new Error("Failed to fetch repo info. Ensure you have access.");
  const repoData = await repoRes.json();
  const defaultBranch = repoData.default_branch;

  // 2. Get Tree (Recursive)
  const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/git/trees/${defaultBranch}?recursive=1`, {
    headers: getHeaders(config.token)
  });
  if (!treeRes.ok) throw new Error("Failed to fetch file tree");
  const treeData = await treeRes.json();

  // 3. Filter valid files
  const validEntries = treeData.tree.filter((node: any) => {
    if (node.type !== 'blob') return false;
    
    const path = node.path; // Keep original case for display, compare with lower
    const lowerPath = path.toLowerCase();
    const segments = lowerPath.split('/');

    // Ignore Ignore Virtual Environments and Metadata (Strict)
    const isIgnored = segments.some((seg: string) => 
      seg === 'venv' || 
      seg === '.venv' || 
      seg === 'env' || 
      seg === '.git' || 
      seg === '.idea' || 
      seg === '.vscode' || 
      seg === '__pycache__' ||
      seg === 'node_modules' ||
      seg === 'dist' ||
      seg === 'build' ||
      seg === '.pytest_cache' ||
      seg.endsWith('.egg-info')
    );

    if (isIgnored) return false;

    // Allow a wide range of code and config files
    return (
      lowerPath.endsWith('.py') || 
      lowerPath.includes('requirements') || 
      lowerPath.includes('lock') || 
      lowerPath.includes('toml') ||
      lowerPath.includes('pipfile') ||
      lowerPath.endsWith('.md') ||
      lowerPath.endsWith('.json') ||
      lowerPath.endsWith('.js') ||
      lowerPath.endsWith('.ts') ||
      lowerPath.endsWith('.tsx') ||
      lowerPath.endsWith('.jsx') ||
      lowerPath.endsWith('.html') ||
      lowerPath.endsWith('.css') ||
      lowerPath.endsWith('.yaml') ||
      lowerPath.endsWith('.yml') ||
      lowerPath.endsWith('.dockerfile') ||
      lowerPath.endsWith('.gitignore')
    );
  }).slice(0, 150); // Limit files to prevent rate limits

  // 4. Fetch blobs in Parallel
  const BATCH_SIZE = 10;
  const files: ProjectFile[] = [];

  for (let i = 0; i < validEntries.length; i += BATCH_SIZE) {
    const batch = validEntries.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(async (entry: any) => {
      try {
        const blobRes = await fetch(entry.url, { headers: getHeaders(config.token) });
        if (!blobRes.ok) return null;
        
        const blobData = await blobRes.json();
        // Decode content
        const content = decodeURIComponent(escape(atob(blobData.content.replace(/\n/g, ''))));
        
        return {
          path: entry.path, 
          content: content,
          language: entry.path.endsWith('.py') ? 'python' : 'text',
          status: 'pending'
        } as ProjectFile;
      } catch (e) {
        console.warn(`Failed to process ${entry.path}`, e);
        return null;
      }
    });
    
    const results = await Promise.all(batchPromises);
    files.push(...results.filter((f): f is ProjectFile => f !== null));
  }

  return files;
};

export const createPullRequest = async (
  config: GitHubConfig, 
  files: ProjectFile[]
): Promise<PullRequestResult> => {
  if (!config.owner || !config.repo || !config.token) {
    throw new Error("Missing GitHub configuration");
  }

  const headers = getHeaders(config.token);
  
  // Identifying all completed and changed files
  const changedFiles = files.filter(f => 
    f.status === 'completed' && 
    f.result?.refactoredCode && 
    f.result.refactoredCode !== f.content
  );
  
  if (changedFiles.length === 0) {
    throw new Error("No changes detected in any file to commit.");
  }

  // 1. Get base info
  const repoRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}`, { headers });
  const repoData = await repoRes.json();
  const defaultBranch = repoData.default_branch;

  if (!repoData.permissions?.push) {
     throw new Error("Write access denied. Cannot create PR.");
  }

  const refRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/git/ref/heads/${defaultBranch}`, { headers });
  const refData = await refRes.json();
  const baseSha = refData.object.sha;

  // 2. Create blobs in parallel
  const treeItems = await Promise.all(changedFiles.map(async (file) => {
    const blobRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: file.result!.refactoredCode,
        encoding: 'utf-8'
      })
    });
    const blobData = await blobRes.json();
    return {
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha
    };
  }));

  // 3. Create Tree
  const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base_tree: baseSha,
      tree: treeItems
    })
  });
  const treeData = await treeRes.json();
  const newTreeSha = treeData.sha;

  // 4. Create Commit
  const commitRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: `refactor: AI Migration for ${changedFiles.length} files\n\nAutomated changes by CodeEvolve.`,
      tree: newTreeSha,
      parents: [baseSha]
    })
  });
  const commitData = await commitRes.json();
  const newCommitSha = commitData.sha;

  // 5. Create Branch
  const branchName = `code-evolve-${Date.now()}`;
  await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: newCommitSha
    })
  });

  // 6. Create PR
  const prRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'refactor: Automated AI Migration',
      body: `This PR contains automated refactoring for **${changedFiles.length} files**.\n\n### Summary\nGenerated by CodeEvolve AI. Includes dependency updates, security patches, and Python version compatibility fixes.`,
      head: branchName,
      base: defaultBranch
    })
  });

  if (!prRes.ok) {
    const err = await prRes.json();
    throw new Error(`Failed to create PR: ${err.message || 'Unknown error'}`);
  }

  const prData = await prRes.json();
  return {
    url: prData.html_url,
    number: prData.number
  };
};
