import React, { useRef, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';

interface EditorProps {
  code: string;
  onChange?: (val: string) => void;
  readOnly?: boolean;
  label: string;
  placeholder?: string;
  className?: string;
}

const Editor: React.FC<EditorProps> = ({ code, onChange, readOnly = false, label, placeholder, className }) => {
  const [copied, setCopied] = React.useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lineCount = code.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <div className={`flex flex-col h-full bg-surface rounded-xl border border-slate-700 overflow-hidden shadow-sm hover:border-slate-600 transition-colors ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700 backdrop-blur-sm">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-2">
          {label}
          {!readOnly && <span className="w-1.5 h-1.5 rounded-full bg-primary/80"></span>}
        </span>
        <div className="flex items-center gap-2">
           {readOnly && (
             <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-600">Read Only</span>
           )}
           {code && (
            <button 
              onClick={handleCopy}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-white"
              title="Copy Code"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 relative group flex bg-[#0a0f1e]">
        {/* Line Numbers */}
        <div 
          ref={lineNumbersRef}
          className="hidden md:block w-12 pt-4 pb-4 bg-slate-900/50 border-r border-slate-800 text-right pr-3 select-none overflow-hidden text-slate-600 font-mono text-sm leading-6"
        >
          {lineNumbers.map(num => (
            <div key={num}>{num}</div>
          ))}
        </div>

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => onChange?.(e.target.value)}
          onScroll={handleScroll}
          readOnly={readOnly}
          placeholder={placeholder}
          spellCheck={false}
          className={`
            flex-1 w-full h-full p-4 bg-transparent text-sm font-mono leading-6 resize-none focus:outline-none 
            ${readOnly ? 'text-slate-300' : 'text-slate-200'}
            placeholder-slate-700 selection:bg-primary/20
            custom-scrollbar
          `}
        />
        
        {!readOnly && (
           <div className="absolute bottom-2 right-4 text-[10px] text-slate-600 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity font-mono">
              Line {lineCount}
           </div>
        )}
      </div>
    </div>
  );
};

export default Editor;
