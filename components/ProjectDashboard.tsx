import React, { useState } from 'react';
import { ProjectFile, Severity, DependencyGraphData } from '../types';
import DependencyGraph from './DependencyGraph';
import { 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  FileCode, 
  ArrowRight, 
  Loader2,
  PieChart,
  LayoutDashboard,
  Network
} from 'lucide-react';
import { buildDependencyGraph } from '../services/dependencyService';

interface ProjectDashboardProps {
  files: ProjectFile[];
  onSelectFile: (path: string) => void;
  isAnalyzing: boolean;
}

const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ files, onSelectFile, isAnalyzing }) => {
  const [view, setView] = useState<'stats' | 'graph'>('stats');

  // Aggregate Stats
  const completedFiles = files.filter(f => f.status === 'completed');
  const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'analyzing');

  let highIssues = 0;
  let mediumIssues = 0;
  let lowIssues = 0;

  files.forEach(f => {
    if (f.result?.changes) {
      highIssues += f.result.changes.filter(c => c.severity === Severity.HIGH).length;
      mediumIssues += f.result.changes.filter(c => c.severity === Severity.MEDIUM).length;
      lowIssues += f.result.changes.filter(c => c.severity === Severity.LOW).length;
    }
  });

  const totalIssues = highIssues + mediumIssues + lowIssues;
  
  const graphData = React.useMemo(() => buildDependencyGraph(files), [files]);

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Dashboard Header */}
      <div className="p-6 pb-2 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-3">
              <LayoutDashboard className="w-6 h-6 text-primary" />
              Project Overview
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Analysis report for <span className="text-white font-mono">{files.length} files</span>.
            </p>
          </div>

          <div className="flex bg-slate-800 p-1 rounded-lg">
             <button 
               onClick={() => setView('stats')}
               className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'stats' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-white'}`}
             >
                <PieChart className="w-3.5 h-3.5" /> Stats
             </button>
             <button 
               onClick={() => setView('graph')}
               className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'graph' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-white'}`}
             >
                <Network className="w-3.5 h-3.5" /> Graph
             </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {view === 'graph' ? (
           <DependencyGraph data={graphData} />
        ) : (
          <div className="h-full overflow-y-auto p-6 custom-scrollbar">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-surface border border-slate-700 p-4 rounded-xl flex flex-col justify-between group hover:border-slate-600 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase">Total Issues</span>
                  <PieChart className="w-4 h-4 text-slate-500" />
                </div>
                <div className="text-3xl font-bold text-white">{totalIssues}</div>
                <div className="text-xs text-slate-500 mt-1">detected across codebase</div>
              </div>

              <div className="bg-surface border border-slate-700 p-4 rounded-xl flex flex-col justify-between group hover:border-red-500/30 transition-all relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                <div className="flex items-center justify-between mb-2 pl-2">
                  <span className="text-xs font-bold text-red-400 uppercase">Critical</span>
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </div>
                <div className="text-3xl font-bold text-white pl-2">{highIssues}</div>
                <div className="text-xs text-slate-500 mt-1 pl-2">High severity items</div>
              </div>

              <div className="bg-surface border border-slate-700 p-4 rounded-xl flex flex-col justify-between group hover:border-orange-500/30 transition-all relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                <div className="flex items-center justify-between mb-2 pl-2">
                  <span className="text-xs font-bold text-orange-400 uppercase">Warning</span>
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                </div>
                <div className="text-3xl font-bold text-white pl-2">{mediumIssues}</div>
                <div className="text-xs text-slate-500 mt-1 pl-2">Medium severity items</div>
              </div>

              <div className="bg-surface border border-slate-700 p-4 rounded-xl flex flex-col justify-between group hover:border-blue-500/30 transition-all relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                <div className="flex items-center justify-between mb-2 pl-2">
                  <span className="text-xs font-bold text-blue-400 uppercase">Analyzed</span>
                  <CheckCircle2 className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-3xl font-bold text-white pl-2">
                    {completedFiles.length}<span className="text-lg text-slate-500">/{files.length}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1 pl-2">
                  {isAnalyzing ? 'Analysis in progress...' : 'Files processed'}
                </div>
              </div>
            </div>

            {/* File Status List */}
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              File Status
              {isAnalyzing && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            </h3>
            
            <div className="bg-surface rounded-xl border border-slate-700 overflow-hidden">
              <div className="grid grid-cols-12 gap-4 p-3 bg-slate-800/50 border-b border-slate-700 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <div className="col-span-6">File Name</div>
                <div className="col-span-3">Status</div>
                <div className="col-span-3 text-right">Issues</div>
              </div>
              
              <div className="divide-y divide-slate-800">
                {files.map((file) => {
                  const fileHigh = file.result?.changes.filter(c => c.severity === Severity.HIGH).length || 0;
                  const fileMed = file.result?.changes.filter(c => c.severity === Severity.MEDIUM).length || 0;
                  
                  return (
                    <div 
                      key={file.path} 
                      onClick={() => onSelectFile(file.path)}
                      className="grid grid-cols-12 gap-4 p-3 items-center hover:bg-slate-800/50 cursor-pointer group transition-colors"
                    >
                      <div className="col-span-6 flex items-center gap-3">
                        <FileCode className={`w-4 h-4 ${file.path.endsWith('.py') ? 'text-blue-400' : 'text-slate-500'}`} />
                        <span className="text-sm font-mono text-slate-300 group-hover:text-white transition-colors truncate">{file.path}</span>
                      </div>
                      
                      <div className="col-span-3">
                        {file.status === 'analyzing' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-medium border border-blue-500/20">
                            <Loader2 className="w-3 h-3 animate-spin" /> Analyzing
                          </span>
                        )}
                        {file.status === 'pending' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-700/50 text-slate-400 text-[10px] font-medium border border-slate-600">
                            Pending
                          </span>
                        )}
                        {file.status === 'error' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/10 text-red-400 text-[10px] font-medium border border-red-500/20">
                            <AlertCircle className="w-3 h-3" /> Failed
                          </span>
                        )}
                        {file.status === 'completed' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                          </span>
                        )}
                      </div>
                      
                      <div className="col-span-3 flex justify-end items-center gap-2">
                        {file.status === 'completed' && (
                          <>
                            {fileHigh > 0 && (
                              <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">{fileHigh} High</span>
                            )}
                            {fileMed > 0 && (
                              <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">{fileMed} Med</span>
                            )}
                            {fileHigh === 0 && fileMed === 0 && (
                              <span className="text-[10px] text-slate-500">No issues</span>
                            )}
                            <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-white ml-2" />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectDashboard;
