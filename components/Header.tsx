import React from 'react';
import { Sparkles, Terminal } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="border-b border-slate-800 bg-background/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Terminal className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              CodeEvolve <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-medium">BETA</span>
            </h1>
            <p className="text-xs text-slate-400">Automated Python Migration & Security Audit</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           <div className="hidden md:flex items-center gap-1 text-xs text-slate-500 font-mono">
             <Sparkles className="w-3 h-3" />
             <span>Powered by Gemini 2.5 Flash</span>
           </div>
           <a 
             href="https://ai.google.dev" 
             target="_blank" 
             rel="noreferrer"
             className="text-xs text-slate-400 hover:text-white transition-colors"
           >
             Docs
           </a>
        </div>
      </div>
    </header>
  );
};

export default Header;