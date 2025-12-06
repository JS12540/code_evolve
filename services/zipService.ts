import JSZip from 'jszip';
import { ProjectFile } from '../types';

export const extractZip = async (file: File): Promise<ProjectFile[]> => {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);
  const files: ProjectFile[] = [];

  const entries = Object.keys(loadedZip.files);

  for (const filename of entries) {
    const fileEntry = loadedZip.files[filename];
    
    // Skip directories and Mac system files
    if (fileEntry.dir || filename.includes('__MACOSX') || filename.startsWith('.')) {
      continue;
    }

    // Simple extension check to decide if we keep it and how to label it
    const isPython = filename.endsWith('.py');
    const isRequirements = filename.endsWith('requirements.txt') || 
                           filename.endsWith('Pipfile') || 
                           filename.endsWith('pyproject.toml') ||
                           filename.endsWith('uv.lock') ||
                           filename.endsWith('poetry.lock');
                           
    const isText = isPython || isRequirements || filename.endsWith('.txt') || filename.endsWith('.md') || filename.endsWith('.json') || filename.endsWith('.yaml') || filename.endsWith('.yml');

    if (isText) {
      const content = await fileEntry.async('string');
      files.push({
        path: filename,
        content: content,
        language: isPython ? 'python' : 'text',
        status: 'pending'
      });
    }
  }

  // Sort files: requirements first, then python files, then others
  return files.sort((a, b) => {
    const getScore = (f: ProjectFile) => {
      const path = f.path.toLowerCase();
      if (path.includes('requirements.txt') || path.includes('pyproject.toml') || path.includes('lock')) return 0;
      if (path.endsWith('.py')) return 1;
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
