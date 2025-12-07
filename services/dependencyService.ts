import { ProjectFile, DependencyGraphData, GraphNode, GraphLink, DependencyItem } from '../types';

export const buildDependencyGraph = (files: ProjectFile[]): DependencyGraphData => {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  
  // 1. Create Nodes
  files.forEach(file => {
    let group = 1;
    if (file.path.endsWith('.py')) group = 2;
    if (file.path.includes('test')) group = 3;
    if (file.path.includes('requirements') || file.path.includes('lock')) group = 4;
    
    nodes.push({ id: file.path, group });
  });

  // 2. Parse Imports to Create Links
  files.forEach(file => {
    if (file.language !== 'python') return;

    const lines = file.content.split('\n');
    lines.forEach(line => {
      // Remove comments
      const trimmed = line.split('#')[0].trim();
      if (!trimmed) return;

      // Regex to capture import statements
      // Matches: from xyz import abc 
      const fromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import/);
      // Matches: import xyz
      const importMatch = trimmed.match(/^import\s+([a-zA-Z0-9_.]+)/);

      let moduleName = '';
      if (fromMatch) moduleName = fromMatch[1];
      else if (importMatch) moduleName = importMatch[1];

      if (moduleName) {
        // Skip standard library common checks if desired, but for now we keep everything
        // unless it clearly maps to a file we have.

        // Normalize module name (e.g., .utils -> utils)
        const cleanModuleName = moduleName.replace(/^\.+/, '');
        
        // Convert module dot notation to potential file paths
        // e.g., 'utils.helpers' -> 'utils/helpers.py'
        const pathSegments = cleanModuleName.split('.');
        const pathVariants = [
          `${pathSegments.join('/')}.py`,               // utils/helpers.py
          `${pathSegments.join('/')}/__init__.py`,      // utils/helpers/__init__.py
          `${pathSegments[pathSegments.length - 1]}.py` // helpers.py (local import)
        ];

        // Find matches in our file list
        // We use a loose matching strategy: if the file path ends with one of our variants
        const target = files.find(f => {
           // Don't link to self
           if (f.path === file.path) return false;
           
           return pathVariants.some(variant => f.path.endsWith(variant));
        });

        if (target) {
          // Avoid duplicate links
          const exists = links.some(l => l.source === file.path && l.target === target.path);
          if (!exists) {
            links.push({ source: file.path, target: target.path });
          }
        }
      }
    });
  });

  return { nodes, links };
};

export const parseRequirements = (content: string): { name: string; version: string }[] => {
  const deps: { name: string; version: string }[] = [];
  const lines = content.split('\n');
  
  lines.forEach(line => {
    const trimmed = line.split('#')[0].trim();
    if (!trimmed) return;
    
    // Basic regex for pip requirements: name==version, name>=version, etc.
    // Handles: package==1.2.3, package>=1.2, package (no version)
    const match = trimmed.match(/^([a-zA-Z0-9_\-]+)((?:==|>=|<=|~=|>|<)[0-9a-zA-Z.]+(?:,[<>=!]+[0-9a-zA-Z.]+)*)?/);
    
    if (match) {
      deps.push({
        name: match[1],
        version: match[2] || 'latest' // preserve the operator (e.g. "==1.2.0")
      });
    }
  });
  
  return deps;
};

export const mapPackagesToFiles = (files: ProjectFile[], packages: string[]): Record<string, string[]> => {
  const mapping: Record<string, string[]> = {};
  
  packages.forEach(pkg => mapping[pkg] = []);

  files.forEach(file => {
    if (file.language !== 'python') return;
    
    // Simple heuristic check for imports
    // NOTE: This handles basic cases. It won't handle dynamic imports or aliased module names perfectly without an AST.
    // e.g. "import pandas" matches package "pandas"
    // e.g. "from sklearn.metrics import ..." matches package "scikit-learn" (mapped manually?)
    // For MVP, we assume package name ~= import name.
    
    const content = file.content;
    
    packages.forEach(pkg => {
      // Normalize pkg name (e.g. "PyYAML" -> "yaml" often, but here we assume strict match for now)
      // or "google-generativeai" -> "google.generativeai"
      
      const pkgNameSimple = pkg.toLowerCase().replace(/-/g, '_'); // typical python conversion
      const regex = new RegExp(`^\\s*(import|from)\\s+${pkgNameSimple}\\b`, 'm');
      
      if (regex.test(content)) {
        mapping[pkg].push(file.path);
      }
    });
  });

  return mapping;
};
