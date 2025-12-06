import { ProjectFile, GitHubConfig, PullRequestResult } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

// Helper to parse "https://github.com/owner/repo"
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

// Fetch all files from a repo (naive recursive tree fetch)
export const fetchRepoContents = async (config: GitHubConfig): Promise<ProjectFile[]> => {
  if (!config.owner || !config.repo || !config.token) {
    throw new Error("Missing GitHub configuration");
  }

  // 1. Get default branch SHA
  const repoRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}`, {
    headers: getHeaders(config.token)
  });
  if (!repoRes.ok) throw new Error("Failed to fetch repo info");
  const repoData = await repoRes.json();
  const defaultBranch = repoData.default_branch;

  // 2. Get Tree
  const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/git/trees/${defaultBranch}?recursive=1`, {
    headers: getHeaders(config.token)
  });
  if (!treeRes.ok) throw new Error("Failed to fetch file tree");
  const treeData = await treeRes.json();

  const files: ProjectFile[] = [];

  // 3. Filter and fetch blobs (Limit to first 20 valid text files to prevent rate limiting in demo)
  const validEntries = treeData.tree.filter((node: any) => 
    node.type === 'blob' && 
    (node.path.endsWith('.py') || node.path.includes('requirements') || node.path.includes('lock') || node.path.includes('toml'))
  ).slice(0, 20); 

  for (const entry of validEntries) {
    const blobRes = await fetch(entry.url, { headers: getHeaders(config.token) });
    if (blobRes.ok) {
      const blobData = await blobRes.json();
      // Content is base64 encoded
      const content = atob(blobData.content.replace(/\n/g, ''));
      
      files.push({
        path: entry.path,
        content: content,
        language: entry.path.endsWith('.py') ? 'python' : 'text',
        status: 'pending'
      });
    }
  }

  return files;
};

// Create a PR with changes
export const createPullRequest = async (
  config: GitHubConfig, 
  files: ProjectFile[]
): Promise<PullRequestResult> => {
  if (!config.owner || !config.repo || !config.token) {
    throw new Error("Missing GitHub configuration");
  }

  const headers = getHeaders(config.token);
  const changedFiles = files.filter(f => f.status === 'completed' && f.result?.refactoredCode && f.result.refactoredCode !== f.content);
  
  if (changedFiles.length === 0) {
    throw new Error("No changes detected to commit.");
  }

  // 1. Get current head reference (main/master)
  const repoRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}`, { headers });
  const repoData = await repoRes.json();
  const defaultBranch = repoData.default_branch;

  const refRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/git/ref/heads/${defaultBranch}`, { headers });
  const refData = await refRes.json();
  const baseSha = refData.object.sha;

  // 2. Create blobs for new files
  const treeItems = [];
  for (const file of changedFiles) {
    const blobRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: file.result!.refactoredCode,
        encoding: 'utf-8'
      })
    });
    const blobData = await blobRes.json();
    treeItems.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha
    });
  }

  // 3. Create a new tree
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

  // 4. Create commit
  const commitRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'refactor: AI-powered migration updates\n\nAutomated changes by CodeEvolve.',
      tree: newTreeSha,
      parents: [baseSha]
    })
  });
  const commitData = await commitRes.json();
  const newCommitSha = commitData.sha;

  // 5. Create Branch (Ref)
  const branchName = `code-evolve-${Date.now()}`;
  await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: newCommitSha
    })
  });

  // 6. Create Pull Request
  const prRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'refactor: Automated AI Migration',
      body: 'This PR contains automated refactoring and security fixes generated by CodeEvolve AI.\n\n### Changes\n- Dependency updates\n- Security patches\n- Deprecation fixes',
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
