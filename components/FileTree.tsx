
import React, { useState, useMemo } from 'react';
import { ProjectFile } from '../types';
import { 
  FileText, 
  FileCode, 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  Loader2, 
  Folder, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown,
  FileJson,
  File,
  LayoutDashboard
} from 'lucide-react';

interface FileTreeProps {
  files: ProjectFile[];
  selectedFile: ProjectFile | null;
  selectedPath: string;
  onSelect: (path: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children: TreeNode[];
  file?: ProjectFile;
}

const buildTree = (files: ProjectFile[]): TreeNode[] => {
  const root: TreeNode[] = [];
  const map: Record<string, TreeNode> = {};

  files.forEach(file => {
    // Normalize path separators
    const normalizedPath = file.path.replace(/\\/g, '/');
    const parts = normalizedPath.split('/').filter(Boolean);
    let currentPath = '';

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!map[currentPath]) {
        const node: TreeNode = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          children: [],
          file: isFile ? file : undefined
        };
        map[currentPath] = node;

        if (index === 0) {
          root.push(node);
        } else {
          if (map[parentPath]) {
            map[parentPath].children.push(node);
          }
        }
      }
    });
  });

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === 'folder' ? -1 : 1;
    });
    nodes.forEach(node => {
      if (node.children.length > 0) {
        sortNodes(node.children);
      }
    });
  };

  sortNodes(root);
  return root;
};

const TreeNodeItem: React.FC<{
  node: TreeNode;
  level: number;
  selectedPath: string;
  onSelect: (path: string) => void;
}> = ({ node, level, selectedPath, onSelect }) => {
  const [isOpen, setIsOpen] = useState(true);

  const isSelected = node.type === 'file' && selectedPath === node.file?.path;
  
  const getFileIcon = (file: ProjectFile) => {
    if (file.path.endsWith('.py')) return <FileCode className="w-4 h-4 text-blue-400" />;
    if (file.path.endsWith('.json')) return <FileJson className="w-4 h-4 text-yellow-400" />;
    if (file.path.endsWith('.md')) return <FileText className="w-4 h-4 text-slate-400" />;
    if (file.path.includes('requirements') || file.path.includes('lock') || file.path.includes('toml')) return <FileCode className="w-4 h-4 text-emerald-400" />;
    return <File className="w-4 h-4 text-slate-500" />;
  };

  const getStatusIcon = (file: ProjectFile) => {
    if (file.status === 'analyzing') return <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />;
    if (file.status === 'error') return <AlertCircle className="w-3 h-3 text-red-500" />;
    if (file.status === 'completed') {
       const hasHighSeverity = file.result?.changes.some(c => c.severity === 'HIGH');
       if (hasHighSeverity) return <AlertCircle className="w-3 h-3 text-red-500" />;
       return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
    }
    return null;
  };

  if (node.type === 'folder') {
    return (
      <div className="select-none">
        <div 
          className="flex items-center gap-1.5 py-1.5 px-2 hover:bg-slate-800/50 rounded-md cursor-pointer text-slate-400 hover:text-slate-200 transition-colors"
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {isOpen ? <FolderOpen className="w-4 h-4 text-primary/80" /> : <Folder className="w-4 h-4 text-primary/80" />}
          <span className="text-xs font-medium truncate">{node.name}</span>
        </div>
        {isOpen && (
          <div>
            {node.children.map(child => (
              <TreeNodeItem 
                key={child.path} 
                node={child} 
                level={level + 1} 
                selectedPath={selectedPath} 
                onSelect={onSelect} 
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => node.file && onSelect(node.file.path)}
      className={`
        w-full flex items-center gap-2 py-1.5 pr-2 rounded-md text-left transition-all group relative
        ${isSelected ? 'bg-primary/20 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}
      `}
      style={{ paddingLeft: `${level * 12 + 20}px` }}
    >
      {node.file && getFileIcon(node.file)}
      <span className={`truncate flex-1 font-mono text-xs ${isSelected ? 'font-semibold' : ''}`}>
        {node.name}
      </span>
      {node.file && getStatusIcon(node.file)}
    </button>
  );
};

const FileTree: React.FC<FileTreeProps> = ({ files, selectedFile, selectedPath, onSelect }) => {
  const treeData = useMemo(() => buildTree(files), [files]);

  return (
    <div className="flex flex-col h-full bg-surface/50">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between sticky top-0 bg-surface/95 backdrop-blur z-10">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Folder className="w-3.5 h-3.5" /> 
          Project Files
        </h3>
        <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full">{files.length}</span>
      </div>

      {/* Fixed Dashboard Link - Moved out of scroll area */}
      <div className="px-2 pt-2 pb-1">
        <button
          onClick={() => onSelect('__PROJECT_ROOT__')}
          className={`
            w-full flex items-center gap-2 py-2 px-2 rounded-md text-left transition-all
            ${selectedPath === '__PROJECT_ROOT__' ? 'bg-primary text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'}
          `}
        >
           <LayoutDashboard className="w-4 h-4" />
           <span className="text-xs font-bold">Project Overview</span>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
        {files.length === 0 ? (
          <div className="text-center py-10 px-4">
             <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3">
                <Folder className="w-6 h-6 text-slate-600" />
             </div>
             <p className="text-slate-500 text-xs">No files loaded.</p>
             <p className="text-slate-600 text-[10px] mt-1">Upload a ZIP or Import from GitHub</p>
          </div>
        ) : (
          treeData.map(node => (
            <TreeNodeItem 
              key={node.path} 
              node={node} 
              level={0} 
              selectedPath={selectedPath} 
              onSelect={onSelect} 
            />
          ))
        )}
      </div>
    </div>
  );
};

export default FileTree;
