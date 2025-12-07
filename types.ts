export enum ChangeType {
  DEPRECATION = 'DEPRECATION',
  SECURITY = 'SECURITY',
  SYNTAX = 'SYNTAX',
  PERFORMANCE = 'PERFORMANCE',
  STYLE = 'STYLE',
  DEPENDENCY = 'DEPENDENCY'
}

export enum Severity {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}

export interface CodeChange {
  type: ChangeType;
  severity: Severity;
  lineNumber: number;
  description: string;
  originalSnippet?: string;
}

export interface Reference {
  title: string;
  url: string;
}

export interface MigrationResult {
  refactoredCode: string;
  changes: CodeChange[];
  summary: string;
  references?: Reference[];
}

export enum TargetVersion {
  PY_3_12 = 'Python 3.12+',
  PY_3_11 = 'Python 3.11',
  PY_3_10 = 'Python 3.10',
  PY_3_9 = 'Python 3.9'
}

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export interface ProjectFile {
  path: string;
  content: string;
  language: 'python' | 'text' | 'other';
  status: 'pending' | 'analyzing' | 'completed' | 'error';
  result?: MigrationResult;
  chatHistory?: ChatMessage[];
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  hasIssues?: boolean;
}

export interface GitHubConfig {
  repoUrl: string; // Kept for compatibility, but we will construct this from selection
  token: string;
  owner?: string;
  repo?: string;
  branch?: string;
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string; // "owner/repo"
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  updated_at: string;
  owner: {
    login: string;
  }
}

export interface PullRequestResult {
  url: string;
  number: number;
}

export interface GraphNode {
  id: string;
  group: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface DependencyGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface DependencyItem {
  name: string;
  currentVersion: string;
  latestVersion?: string;
  usageCount: number;
  usedInFiles: string[]; // paths
  sourceFile: string; // which file defined this dependency
  status: 'up-to-date' | 'outdated' | 'unknown';
}