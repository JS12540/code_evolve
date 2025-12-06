
import React, { useState } from 'react';
import { Github, Loader2, CheckCircle2, ArrowRight, ShieldCheck, Key } from 'lucide-react';
import { validateToken } from '../services/githubService';
import { GitHubUser } from '../types';

interface GitHubAuthProps {
  onLogin: (token: string, user: GitHubUser) => void;
  isLoading?: boolean;
}

const GitHubAuth: React.FC<GitHubAuthProps> = ({ onLogin, isLoading = false }) => {
  const [step, setStep] = useState<'initial' | 'input'>('initial');
  const [tokenInput, setTokenInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const SCOPES = 'repo,read:user,workflow';
  const DESCRIPTION = 'CodeEvolve AI Assistant';
  const AUTH_URL = `https://github.com/settings/tokens/new?description=${encodeURIComponent(DESCRIPTION)}&scopes=${SCOPES}`;

  const handleStartAuth = () => {
    window.open(AUTH_URL, '_blank');
    setStep('input');
  };

  const handleVerify = async () => {
    if (!tokenInput.trim()) return;
    
    setValidating(true);
    setError(null);
    try {
      const user = await validateToken(tokenInput.trim());
      onLogin(tokenInput.trim(), user);
    } catch (err: any) {
      setError("Invalid key. Please try again.");
    } finally {
      setValidating(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text.startsWith('ghp_') || text.startsWith('github_pat_')) {
      // Auto-submit for better UX
      setTokenInput(text);
      setTimeout(() => {
          // We can't access state immediately after set, so we use the text directly
          setValidating(true);
          validateToken(text)
            .then(user => onLogin(text, user))
            .catch(() => {
                setError("Invalid key.");
                setValidating(false);
            });
      }, 100);
    }
  };

  if (step === 'initial') {
    return (
      <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col items-center text-center space-y-4">
        <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-1">
          <Github className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Connect GitHub Account</h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Sign in to access your public & private repositories and enable automated Pull Requests.
          </p>
        </div>
        <button
          onClick={handleStartAuth}
          disabled={isLoading}
          className="w-full py-2.5 bg-[#24292F] hover:bg-[#24292F]/90 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-black/20"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
          Sign in with GitHub
        </button>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
           <ShieldCheck className="w-3 h-3" />
           <span>Secure Client-Side Connection</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 animate-in fade-in slide-in-from-right-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Key className="w-3.5 h-3.5 text-primary" />
            Complete Sign In
        </h3>
        <button onClick={() => setStep('initial')} className="text-[10px] text-slate-500 hover:text-white">Cancel</button>
      </div>

      <div className="space-y-4">
        <div className="text-xs text-slate-400">
          <p className="mb-2">1. A browser window opened to GitHub.</p>
          <p className="mb-2">2. Scroll down and click <span className="font-mono bg-slate-800 px-1 py-0.5 rounded text-slate-200">Generate token</span>.</p>
          <p>3. Paste the key below:</p>
        </div>

        <div className="relative">
            <input
                autoFocus
                type="password"
                value={tokenInput}
                onChange={(e) => {
                    setTokenInput(e.target.value);
                    setError(null);
                }}
                onPaste={handlePaste}
                placeholder="Paste key starting with ghp_..."
                className={`
                    w-full bg-slate-950 border rounded-lg pl-3 pr-10 py-2.5 text-xs text-white focus:outline-none focus:ring-1
                    ${error ? 'border-red-500/50 focus:ring-red-500/50' : 'border-slate-700 focus:ring-primary/50'}
                `}
            />
            <div className="absolute right-3 top-2.5">
                {validating ? (
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                ) : tokenInput ? (
                    <button onClick={handleVerify} className="text-primary hover:text-white transition-colors">
                        <ArrowRight className="w-4 h-4" />
                    </button>
                ) : null}
            </div>
        </div>
        
        {error && (
            <p className="text-[10px] text-red-400 flex items-center gap-1 animate-pulse">
                <CheckCircle2 className="w-3 h-3" /> {error}
            </p>
        )}
        
        <button 
            onClick={handleStartAuth} 
            className="w-full text-[10px] text-slate-500 hover:text-primary transition-colors text-center"
        >
            Didn't open? Click here to try again.
        </button>
      </div>
    </div>
  );
};

export default GitHubAuth;
