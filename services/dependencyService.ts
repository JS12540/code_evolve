import { ProjectFile, DependencyGraphData, GraphNode, GraphLink, DependencyItem } from '../types';

export const buildDependencyGraph = (files: ProjectFile[]): DependencyGraphData => {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  
  // 1. Create Nodes
  files.forEach(file => {
    let group = 1;
    if (file.path.endsWith('.py')) group = 2;
    if (file.path.includes('test')) group = 3;
    if (file.path.includes('requirements') || file.path.includes('lock') || file.path.includes('toml')) group = 4;
    
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
      const fromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import/);
      const importMatch = trimmed.match(/^import\s+([a-zA-Z0-9_.]+)/);

      let moduleName = '';
      if (fromMatch) moduleName = fromMatch[1];
      else if (importMatch) moduleName = importMatch[1];

      if (moduleName) {
        const cleanModuleName = moduleName.replace(/^\.+/, '');
        const pathSegments = cleanModuleName.split('.');
        const pathVariants = [
          `${pathSegments.join('/')}.py`,
          `${pathSegments.join('/')}/__init__.py`,
          `${pathSegments[pathSegments.length - 1]}.py`
        ];

        const target = files.find(f => {
           if (f.path === file.path) return false;
           return pathVariants.some(variant => f.path.endsWith(variant));
        });

        if (target) {
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

// --- Parsers ---

const parseRequirementsTxt = (content: string): { name: string; version: string }[] => {
  const deps: { name: string; version: string }[] = [];
  content.split('\n').forEach(line => {
    const trimmed = line.split('#')[0].trim();
    if (!trimmed) return;
    const match = trimmed.match(/^([a-zA-Z0-9_\-]+)((?:==|>=|<=|~=|>|<)[0-9a-zA-Z.]+(?:,[<>=!]+[0-9a-zA-Z.]+)*)?/);
    if (match) {
      deps.push({ name: match[1], version: match[2] || 'latest' });
    }
  });
  return deps;
};

const parsePyProjectToml = (content: string): { name: string; version: string }[] => {
  const deps: { name: string; version: string }[] = [];
  const lines = content.split('\n');
  let inDependenciesSection = false;

  // Simple parser: Looks for [project.dependencies], [tool.poetry.dependencies]
  // Then looks for key = "value"
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
       if (trimmed.includes('dependencies')) {
         inDependenciesSection = true;
       } else {
         inDependenciesSection = false;
       }
       continue;
    }

    if (inDependenciesSection && trimmed) {
      // Match: package = "^1.0.0" or "package" = "1.0.0"
      const match = trimmed.match(/^"?([a-zA-Z0-9_\-]+)"?\s*=\s*"?([0-9a-zA-Z.\^~<>=!]+)"?/);
      if (match) {
        deps.push({ name: match[1], version: match[2] });
      }
    }
  }
  return deps;
};

const parseLockFile = (content: string): { name: string; version: string }[] => {
  const deps: { name: string; version: string }[] = [];
  const lines = content.split('\n');
  
  // TOML-based locks (uv.lock, poetry.lock) usually have [[package]] blocks
  let currentPackage: { name?: string; version?: string } = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '[[package]]') {
      if (currentPackage.name && currentPackage.version) {
        deps.push({ name: currentPackage.name, version: currentPackage.version });
      }
      currentPackage = {};
    } else if (trimmed.startsWith('name =')) {
      const match = trimmed.match(/name\s*=\s*"(.*)"/);
      if (match) currentPackage.name = match[1];
    } else if (trimmed.startsWith('version =')) {
      const match = trimmed.match(/version\s*=\s*"(.*)"/);
      if (match) currentPackage.version = match[1];
    }
  }
  // push last
  if (currentPackage.name && currentPackage.version) {
    deps.push({ name: currentPackage.name, version: currentPackage.version });
  }
  
  return deps;
};

const parsePipfile = (content: string): { name: string; version: string }[] => {
  const deps: { name: string; version: string }[] = [];
  const lines = content.split('\n');
  let inPackages = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '[packages]') {
      inPackages = true;
      continue;
    } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inPackages = false;
    }
    
    if (inPackages && trimmed) {
       const match = trimmed.match(/^([a-zA-Z0-9_\-]+)\s*=\s*"(.*)"/);
       if (match) deps.push({ name: match[1], version: match[2] });
    }
  }
  return deps;
};

export const extractAllDependencies = (files: ProjectFile[]): { file: string, items: { name: string; version: string }[] }[] => {
  const results: { file: string, items: { name: string; version: string }[] }[] = [];

  files.forEach(f => {
    const lower = f.path.toLowerCase();
    if (lower.endsWith('requirements.txt')) {
      results.push({ file: f.path, items: parseRequirementsTxt(f.content) });
    } else if (lower.endsWith('pyproject.toml')) {
      results.push({ file: f.path, items: parsePyProjectToml(f.content) });
    } else if (lower.endsWith('uv.lock') || lower.endsWith('poetry.lock')) {
      results.push({ file: f.path, items: parseLockFile(f.content) });
    } else if (lower.endsWith('pipfile')) {
      results.push({ file: f.path, items: parsePipfile(f.content) });
    }
  });

  return results;
};

export const mapPackagesToFiles = (files: ProjectFile[], packages: string[]): Record<string, string[]> => {
  const mapping: Record<string, string[]> = {};
  packages.forEach(pkg => mapping[pkg] = []);

  files.forEach(file => {
    if (file.language !== 'python') return;
    const content = file.content;
    
    packages.forEach(pkg => {
      const pkgNameSimple = pkg.toLowerCase().replace(/-/g, '_');
      const regex = new RegExp(`^\\s*(import|from)\\s+${pkgNameSimple}\\b`, 'm');
      if (regex.test(content)) {
        mapping[pkg].push(file.path);
      }
    });
  });

  return mapping;
};

// Re-export for compatibility if needed, though mostly replaced by extractAllDependencies
export const parseRequirements = parseRequirementsTxt;