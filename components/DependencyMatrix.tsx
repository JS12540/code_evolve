import React, { useState } from 'react';
import { DependencyItem } from '../types';
import { RefreshCw, ArrowUpCircle, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface DependencyMatrixProps {
  dependencies: DependencyItem[];
  onCheckUpdates: () => void;
  onUpgrade: (pkgName: string, newVersion: string, filesToRefactor: string[]) => void;
  isLoading: boolean;
}

const DependencyMatrix: React.FC<DependencyMatrixProps> = ({ 
  dependencies, 
  onCheckUpdates, 
  onUpgrade, 
  isLoading 
}) => {
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const handleUpgrade = (pkg: DependencyItem) => {
    if (!pkg.latestVersion) return;
    setUpgrading(pkg.name);
    onUpgrade(pkg.name, pkg.latestVersion, pkg.usedInFiles);
    // Simulate delay or wait for parent to finish (optimistic update handled by parent usually)
    setTimeout(() => setUpgrading(null), 2000); 
  };

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
         <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
               Dependency Health Matrix
            </h3>
            <p className="text-xs text-slate-400 mt-1">
               Track versions, vulnerability status, and usage across your project.
            </p>
         </div>
         <button
           onClick={onCheckUpdates}
           disabled={isLoading}
           className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-xs font-medium transition-colors border border-slate-700 disabled:opacity-50"
         >
           {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
           Check for Updates
         </button>
      </div>

      <div className="bg-surface rounded-xl border border-slate-700 overflow-hidden flex-1 flex flex-col">
        <div className="overflow-y-auto custom-scrollbar flex-1">
           <table className="w-full text-left text-sm">
             <thead className="bg-slate-900/50 text-xs uppercase font-semibold text-slate-400">
               <tr>
                 <th className="px-6 py-3">Package</th>
                 <th className="px-6 py-3">Current</th>
                 <th className="px-6 py-3">Latest</th>
                 <th className="px-6 py-3 text-center">Usage</th>
                 <th className="px-6 py-3 text-right">Status</th>
                 <th className="px-6 py-3 text-right">Action</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-800">
               {dependencies.length === 0 ? (
                 <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      No dependencies found. Make sure you have a <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">requirements.txt</code> file.
                    </td>
                 </tr>
               ) : (
                 dependencies.map((pkg, idx) => (
                   <tr key={idx} className="hover:bg-slate-800/30 transition-colors group">
                     <td className="px-6 py-3 font-mono text-slate-200">{pkg.name}</td>
                     <td className="px-6 py-3 text-slate-400 font-mono text-xs">{pkg.currentVersion}</td>
                     <td className="px-6 py-3 font-mono text-xs">
                       {pkg.latestVersion || (isLoading ? '...' : '-')}
                     </td>
                     <td className="px-6 py-3 text-center">
                       <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold min-w-[24px]">
                         {pkg.usageCount}
                       </span>
                     </td>
                     <td className="px-6 py-3 text-right">
                        {pkg.status === 'outdated' && (
                           <span className="inline-flex items-center gap-1 text-orange-400 text-xs">
                             <AlertCircle className="w-3 h-3" /> Outdated
                           </span>
                        )}
                        {pkg.status === 'up-to-date' && (
                           <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                             <CheckCircle className="w-3 h-3" /> Latest
                           </span>
                        )}
                        {pkg.status === 'unknown' && (
                           <span className="text-slate-600 text-xs">-</span>
                        )}
                     </td>
                     <td className="px-6 py-3 text-right">
                        {pkg.status === 'outdated' && (
                          <button 
                            onClick={() => handleUpgrade(pkg)}
                            disabled={upgrading === pkg.name}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-md text-xs font-medium transition-all disabled:opacity-50"
                          >
                            {upgrading === pkg.name ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUpCircle className="w-3 h-3" />}
                            Upgrade
                          </button>
                        )}
                     </td>
                   </tr>
                 ))
               )}
             </tbody>
           </table>
        </div>
      </div>
    </div>
  );
};

export default DependencyMatrix;
