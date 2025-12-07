import React, { useMemo } from 'react';
import * as Diff from 'diff';

interface DiffViewerProps {
  original: string;
  modified: string;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ original, modified }) => {
  const diff = useMemo(() => {
    return Diff.diffLines(original, modified);
  }, [original, modified]);

  return (
    <div className="flex flex-col h-full bg-[#0a0f1e] text-xs font-mono overflow-auto custom-scrollbar">
      <div className="flex-1 min-w-full">
        {diff.map((part, index) => {
          const color = part.added ? 'bg-emerald-900/30 text-emerald-100' : 
                        part.removed ? 'bg-red-900/30 text-red-100' : 
                        'text-slate-400';
          
          const prefix = part.added ? '+' : part.removed ? '-' : ' ';
          const lines = part.value.replace(/\n$/, '').split('\n');

          return lines.map((line, lineIndex) => (
             <div key={`${index}-${lineIndex}`} className={`flex hover:bg-white/5 ${color}`}>
               <div className="w-8 flex-shrink-0 select-none text-right pr-3 opacity-30 bg-black/20">{prefix}</div>
               <div className="whitespace-pre flex-1 pl-2">{line}</div>
             </div>
          ));
        })}
      </div>
    </div>
  );
};

export default DiffViewer;
