import React from 'react';
import { ProjectFile } from '../types';
import { FileText, FileCode, CheckCircle2, Circle, AlertCircle, Loader2, Folder } from 'lucide-react';

interface FileTreeProps {
  files: ProjectFile[];
  selectedFile: ProjectFile | null;
  onSelect: (file: ProjectFile) => void;
}

const FileTree: React.FC<FileTreeProps> = ({ files, selectedFile, onSelect }) => {
  // Simple flat view for MVP, grouped by type effectively by the sort order
  return (
    <div className="flex flex-col h-full bg-surface/50 overflow-y-auto">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Project Files</h3>
      </div>
      <div className="p-2 space-y-1">
        {files.map((file) => {
          const isSelected = selectedFile?.path === file.path;
          const isPython = file.language === 'python';
          
          let StatusIcon = Circle;
          let iconColor = 'text-slate-600';

          if (file.status === 'analyzing') {
            StatusIcon = Loader2;
            iconColor = 'text-blue-400 animate-spin';
          } else if (file.status === 'completed') {
            const hasHighSeverity = file.result?.changes.some(c => c.severity === 'HIGH');
            StatusIcon = hasHighSeverity ? AlertCircle : CheckCircle2;
            iconColor = hasHighSeverity ? 'text-red-500' : 'text-emerald-500';
          } else if (file.status === 'error') {
            StatusIcon = AlertCircle;
            iconColor = 'text-red-500';
          }

          return (
            <button
              key={file.path}
              onClick={() => onSelect(file)}
              className={`
                w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-all
                ${isSelected ? 'bg-primary/20 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}
              `}
            >
              <div className="flex-shrink-0">
                {isPython ? <FileCode className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              </div>
              <span className="truncate flex-1 font-mono text-xs">{file.path}</span>
              <StatusIcon className={`w-3 h-3 ${iconColor}`} />
            </button>
          );
        })}
        {files.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-xs px-4">
            No files loaded. Upload a .zip or .py file to begin.
          </div>
        )}
      </div>
    </div>
  );
};

export default FileTree;