import React, { useState, useRef, useLayoutEffect } from 'react';
import { ChatMessage } from '../types';
import { Send, Bot, User, X } from 'lucide-react';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  onClose: () => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, onSendMessage, isLoading, onClose }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  };

  useLayoutEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-surface border-l border-slate-700 w-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800/50">
        <h3 className="font-semibold text-slate-200 flex items-center gap-2 text-sm">
          <Bot className="w-4 h-4 text-primary" />
          Codebase Chat
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0a0f1e] custom-scrollbar">
        {messages.length === 0 && (
          <div className="text-center text-xs text-slate-500 mt-10 p-4">
            <div className="w-12 h-12 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-3">
               <Bot className="w-6 h-6 text-slate-600" />
            </div>
            <p className="mb-2 font-medium text-slate-400">Contextual Coding Assistant</p>
            <p>"Refactor this function to be async"</p>
            <p>"Update the dependencies to match requirements"</p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`
              w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1
              ${msg.role === 'ai' ? 'bg-primary/20 text-primary' : 'bg-slate-700 text-slate-300'}
            `}>
              {msg.role === 'ai' ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
            </div>
            <div className={`
              max-w-[85%] p-2.5 rounded-lg text-xs leading-relaxed border
              ${msg.role === 'ai' 
                ? 'bg-slate-800 text-slate-300 border-slate-700' 
                : 'bg-primary/10 text-white border-primary/20'
              }
            `}>
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
             <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
               <Bot className="w-3.5 h-3.5 text-primary" />
             </div>
             <div className="bg-slate-800 p-3 rounded-lg flex gap-1 items-center">
               <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></span>
               <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-100"></span>
               <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-200"></span>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-700 bg-slate-800/50">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI to change code..."
            className="w-full bg-slate-900 border border-slate-700 rounded-md pl-3 pr-10 py-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary placeholder-slate-600"
            disabled={isLoading}
          />
          <button 
            type="submit" 
            disabled={!input.trim() || isLoading}
            className="absolute right-1.5 top-1.5 p-1.5 bg-primary rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:bg-slate-700 text-white"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatPanel;