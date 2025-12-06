import React from 'react';
import { CodeChange, ChangeType, Severity, Reference } from '../types';
import { 
  AlertTriangle, 
  ShieldAlert, 
  Zap, 
  Type, 
  FileCode, 
  ExternalLink, 
  BookOpen,
  CheckCircle2,
  AlertOctagon,
  Info
} from 'lucide-react';

interface ChangeLogProps {
  changes: CodeChange[];
  summary: string;
  references?: Reference[];
}

const ChangeLog: React.FC<ChangeLogProps> = ({ changes, summary, references }) => {
  // Calculate Stats
  const highCount = changes.filter(c => c.severity === Severity.HIGH).length;
  const mediumCount = changes.filter(c => c.severity === Severity.MEDIUM).length;
  const lowCount = changes.filter(c => c.severity === Severity.LOW).length;

  const getIcon = (type: ChangeType) => {
    switch (type) {
      case ChangeType.SECURITY: return <ShieldAlert className="w-4 h-4" />;
      case ChangeType.DEPRECATION: return <AlertTriangle className="w-4 h-4" />;
      case ChangeType.PERFORMANCE: return <Zap className="w-4 h-4" />;
      case ChangeType.SYNTAX: return <FileCode className="w-4 h-4" />;
      case ChangeType.DEPENDENCY: return <FileCode className="w-4 h-4" />;
      default: return <Type className="w-4 h-4" />;
    }
  };

  const getSeverityStyles = (severity: Severity) => {
    switch (severity) {
      case Severity.HIGH: return {
        border: 'border-l-red-500',
        badge: 'bg-red-500/10 text-red-400 border-red-500/20',
        iconColor: 'text-red-400',
        bg: 'bg-red-950/5' // Very subtle tint
      };
      case Severity.MEDIUM: return {
        border: 'border-l-orange-500',
        badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
        iconColor: 'text-orange-400',
        bg: 'bg-orange-950/5'
      };
      case Severity.LOW: return {
        border: 'border-l-blue-500',
        badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        iconColor: 'text-blue-400',
        bg: 'bg-blue-950/5'
      };
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-slate-700 overflow-hidden h-full flex flex-col">
      
      {/* Dashboard Header */}
      <div className="p-5 border-b border-slate-700 bg-slate-800/30">
        <h3 className="font-semibold text-lg text-slate-100 mb-4 flex items-center gap-2">
          <AlertOctagon className="w-5 h-5 text-primary" />
          Migration Report
        </h3>
        
        {/* Severity Stats Cards */}
        <div className="grid grid-cols-3 gap-3 mb-2">
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50 flex flex-col items-center justify-center relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
            <span className="text-2xl font-bold text-slate-200 group-hover:scale-110 transition-transform">{highCount}</span>
            <span className="text-[10px] uppercase tracking-wider text-red-400 font-semibold mt-1">High Risk</span>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50 flex flex-col items-center justify-center relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-orange-500"></div>
            <span className="text-2xl font-bold text-slate-200 group-hover:scale-110 transition-transform">{mediumCount}</span>
            <span className="text-[10px] uppercase tracking-wider text-orange-400 font-semibold mt-1">Medium</span>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50 flex flex-col items-center justify-center relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
            <span className="text-2xl font-bold text-slate-200 group-hover:scale-110 transition-transform">{lowCount}</span>
            <span className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold mt-1">Low</span>
          </div>
        </div>
      </div>

      {/* Main Content Scroll Area */}
      <div className="overflow-y-auto flex-1 p-5 space-y-8 custom-scrollbar">
        
        {/* Executive Summary */}
        <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <Info className="w-3 h-3" /> Analysis Summary
          </h4>
          <p className="text-sm text-slate-300 leading-relaxed">
            {summary || "No summary available."}
          </p>
        </div>

        {/* Changes List */}
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Detailed Changes</h4>
          <div className="space-y-3">
            {changes.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/30">
                 <CheckCircle2 className="w-8 h-8 text-emerald-500/50 mb-3" />
                 <p className="text-slate-500 text-sm">No major issues detected.</p>
               </div>
            ) : (
              changes.map((change, index) => {
                const styles = getSeverityStyles(change.severity);
                return (
                  <div 
                    key={index} 
                    className={`
                      relative rounded-lg border border-slate-800 border-l-4 ${styles.border} ${styles.bg}
                      hover:bg-slate-800/80 transition-all duration-200 group
                    `}
                  >
                    <div className="p-4">
                      {/* Header Row */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`p-1.5 rounded-md bg-slate-900 ${styles.iconColor}`}>
                            {getIcon(change.type)}
                          </span>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${styles.badge}`}>
                            {change.severity}
                          </span>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide opacity-75">{change.type}</span>
                        </div>
                        <span className="text-xs font-mono text-slate-600 bg-slate-900/50 px-2 py-1 rounded">Line {change.lineNumber}</span>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-slate-200 mb-3 ml-1">{change.description}</p>
                      
                      {/* Code Snippet */}
                      {change.originalSnippet && (
                        <div className="mt-2 text-xs font-mono bg-black/40 p-3 rounded-md text-slate-400 border border-slate-800/50 overflow-x-auto">
                          <div className="flex gap-3">
                            <span className="text-red-500/50 select-none">-</span>
                            <span className="break-all whitespace-pre-wrap">{change.originalSnippet}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* References Section */}
        {references && references.length > 0 && (
          <div className="border-t border-slate-800 pt-6">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-500" />
              Verified Sources & Documentation
            </h4>
            <div className="grid grid-cols-1 gap-2">
              {references.map((ref, i) => (
                <a 
                  key={i} 
                  href={ref.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/30 transition-all group"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-1 h-8 bg-emerald-500/30 rounded-full group-hover:bg-emerald-500 transition-colors"></div>
                    <span className="text-sm text-slate-300 group-hover:text-emerald-400 truncate font-medium">{ref.title}</span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 flex-shrink-0 ml-2" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChangeLog;
