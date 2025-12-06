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

export interface ProjectFile {
  path: string;
  content: string;
  language: 'python' | 'text' | 'other';
  status: 'pending' | 'analyzing' | 'completed' | 'error';
  result?: MigrationResult;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  hasIssues?: boolean;
}

export interface GitHubConfig {
  repoUrl: string;
  token: string;
  owner?: string;
  repo?: string;
  branch?: string;
}

export interface PullRequestResult {
  url: string;
  number: number;
}
