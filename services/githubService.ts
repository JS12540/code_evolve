
import { ProjectFile, GitHubConfig, PullRequestResult, GitHubUser, GitHubRepo } from '../types';

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
  // Fetch repositories from the user and organizations they have access to
  // visibility=all: Get public and private
  // affiliation=owner,collaborator,organization_member: Get everything
  const res = await fetch(
    `${GITHUB_API_BASE}/user/repos?sort=updated&per_page=100&visibility=all&affiliation=owner,collaborator,organization_member`, 
    { headers: getHeaders(token) }
  );

  if (!res.ok) throw new Error("Failed to fetch repositories.");
  return res.json();
};

// Fetch all files from a repo (naive recursive tree fetch)
export const fetchRepoContents = async (config: GitHubConfig): Promise<ProjectFile[]> => {
  if (!config.owner || !config.repo || !config.token) {
    throw new Error("Missing GitHub configuration");
  }

  // 1. Get default branch SHA
  const repoRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}`, {
    headers: getHeaders(config.token)
  });
  if (!repoRes.ok) throw new Error("Failed to fetch repo info. Ensure you have access to this repository.");
  const repoData = await repoRes.json();
  const defaultBranch = repoData.default_branch;

  // 2. Get Tree
  const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/git/trees/${defaultBranch}?recursive=1`, {
    headers: getHeaders(config.token)
  });
  if (!treeRes.ok) throw new Error("Failed to fetch file tree");
  const treeData = await treeRes.json();

  const files: ProjectFile[] = [];

  // 3. Filter and fetch blobs 
  // Increased limit to 100 for better project visibility
  // Added more extensions to visibility list
  const validEntries = treeData.tree.filter((node: any) => {
    if (node.type !== 'blob') return false;
    
    const path = node.path.toLowerCase();
    return (
      path.endsWith('.py') || 
      path.includes('requirements') || 
      path.includes('lock') || 
      path.includes('toml') ||
      path.endsWith('.md') ||
      path.endsWith('.json') ||
      path.endsWith('.js') ||
      path.endsWith('.ts') ||
      path.endsWith('.tsx') ||
      path.endsWith('.jsx') ||
      path.endsWith('.html') ||
      path.endsWith('.css') ||
      path.endsWith('.yaml') ||
      path.endsWith('.yml') ||
      path.endsWith('.dockerfile') ||
      path.endsWith('.gitignore')
    );
  }).slice(0, 100); 

  for (const entry of validEntries) {
    const blobRes = await fetch(entry.url, { headers: getHeaders(config.token) });
    if (blobRes.ok) {
      const blobData = await blobRes.json();
      // Content is base64 encoded
      // Note: simple atob() fails on unicode, but for MVP code migration it's usually fine.
      // A more robust solution would be needed for complex unicode files.
      try {
        const content = decodeURIComponent(escape(atob(blobData.content.replace(/\n/g, ''))));
        
        files.push({
          path: entry.path,
          content: content,
          language: entry.path.endsWith('.py') ? 'python' : 'text',
          status: 'pending'
        });
      } catch (e) {
        console.warn(`Failed to decode file ${entry.path}`, e);
        // Push with placeholder if decode fails (e.g. binary disguised as text)
        files.push({
          path: entry.path,
          content: "// Binary or non-utf8 content could not be displayed.",
          language: 'text',
          status: 'error'
        });
      }
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

  // Check if we have push access
  if (!repoData.permissions?.push) {
     throw new Error("You don't have write access to this repository. Cannot create a Pull Request directly.");
  }

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
