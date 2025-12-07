import JSZip from 'jszip';
import { ProjectFile } from '../types';

export const extractZip = async (file: File): Promise<ProjectFile[]> => {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);
  const files: ProjectFile[] = [];

  const entries = Object.keys(loadedZip.files);

  for (const filename of entries) {
    const fileEntry = loadedZip.files[filename];
    
    // Normalize path
    const path = filename.replace(/\\/g, '/');
    const segments = path.split('/');

    // 1. Ignore Directories & System Files
    if (fileEntry.dir || path.includes('__MACOSX') || path.startsWith('.')) {
      continue;
    }

    // 2. Ignore Virtual Environments and Metadata
    const isIgnored = segments.some(seg => 
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
      seg.endsWith('.egg-info')
    );

    if (isIgnored) continue;

    // 3. Filter for Text/Code Files
    const isPython = path.endsWith('.py');
    const isConfig = path.endsWith('requirements.txt') || 
                     path.endsWith('Pipfile') || 
                     path.endsWith('pyproject.toml') ||
                     path.endsWith('uv.lock') ||
                     path.endsWith('poetry.lock');
                           
    const isText = isPython || isConfig || 
                   path.endsWith('.txt') || 
                   path.endsWith('.md') || 
                   path.endsWith('.json') || 
                   path.endsWith('.yaml') || 
                   path.endsWith('.yml') ||
                   path.endsWith('.ini') ||
                   path.endsWith('.dockerfile');

    if (isText) {
      const content = await fileEntry.async('string');
      files.push({
        path: path,
        content: content,
        language: isPython ? 'python' : 'text',
        status: 'pending'
      });
    }
  }

  // Sort: Configs -> Python -> Others
  return files.sort((a, b) => {
    const getScore = (f: ProjectFile) => {
      const p = f.path.toLowerCase();
      if (p.includes('requirements.txt') || p.includes('pyproject.toml')) return 0;
      if (p.endsWith('.py')) return 1;
      return 2;
    };
    return getScore(a) - getScore(b);
  });
};

export const createAndDownloadZip = async (files: ProjectFile[]) => {
  const zip = new JSZip();

  files.forEach(file => {
    // Use refactored code if available, otherwise original content
    const contentToSave = (file.status === 'completed' && file.result?.refactoredCode) 
      ? file.result.refactoredCode 
      : file.content;
      
    zip.file(file.path, contentToSave);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  
  // Trigger download
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'code-evolve-migrated.zip';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};