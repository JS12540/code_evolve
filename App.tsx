import React, { useState, useMemo, useEffect } from 'react';
import Header from './components/Header';
import Editor from './components/Editor';
import ChangeLog from './components/ChangeLog';
import FileTree from './components/FileTree';
import GitHubAuth from './components/GitHubAuth';
import ProjectDashboard from './components/ProjectDashboard';
import DiffViewer from './components/DiffViewer';
import ChatPanel from './components/ChatPanel';
import { analyzeCode, generateUnitTests, chatRefinement, auditDependencyVersions } from './services/geminiService';
import { extractZip, createAndDownloadZip } from './services/zipService';
import { fetchRepoContents, createPullRequest, fetchUserRepos } from './services/githubService';
import { extractAllDependencies, mapPackagesToFiles } from './services/dependencyService';
import { generateMigrationReport } from './services/pdfService';
import { MigrationResult, TargetVersion, ProjectFile, GitHubConfig, GitHubUser, GitHubRepo, ChatMessage, DependencyItem } from './types';
import { 
  Upload, 
  AlertCircle, 
  Loader2, 
  FolderOpen, 
  FileCode, 
  BarChart3, 
  Code2, 
  Download,
  FileText,
  GitPullRequest,
  Check,
  Search,
  LogOut,
  Lock,
  Globe,
  ArrowLeft,
  Bot,
  TestTube2,
  GitCompare,
  MessageSquare
} from 'lucide-react';

const INITIAL_CODE_EXAMPLE = `# Legacy Python Example
import distutils
import time
from cgi import escape

def process_user_data(data):
    # Old formatting style
    print "Processing data: %s" % data
    
    # Insecure usage
    eval("print('executing arbitrary code')")
    
    # Deprecated in 3.12+
    escaped = escape(data)
    
    return escaped

if __name__ == '__main__':
    user_input = "<script>alert('hack')</script>"
    process_user_data(user_input)
`;

type SourceMode = 'upload' | 'github';
const PROJECT_ROOT_ID = '__PROJECT_ROOT__';

function App() {
  const [files, setFiles] = useState<ProjectFile[]>([
    {
      path: 'example.py',
      content: INITIAL_CODE_EXAMPLE,
      language: 'python',
      status: 'pending'
    }
  ]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('example.py');
  const [targetVersion, setTargetVersion] = useState<TargetVersion>(TargetVersion.PY_3_12);
  const [isProjectAnalyzing, setIsProjectAnalyzing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  
  // Dependency State
  const [dependencies, setDependencies] = useState<DependencyItem[]>([]);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  // Modes & Config
  const [sourceMode, setSourceMode] = useState<SourceMode>('upload');
  
  // GitHub State
  const [githubToken, setGithubToken] = useState('');
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string>('');
  const [repoSearch, setRepoSearch] = useState('');
  
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [prStatus, setPrStatus] = useState<{ url?: string; loading: boolean; error?: string } | null>(null);

  // View State
  const [activeTab, setActiveTab] = useState<'report' | 'code' | 'diff'>('report');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isGeneratingTests, setIsGeneratingTests] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const selectedFile = files.find(f => f.path === selectedFilePath);

  // Parse dependencies whenever file list significantly changes (e.g. import)
  useEffect(() => {
    // Only run if we have files
    if (files.length === 0) return;

    // Use new extraction service that handles multiple file types
    const extractedDeps = extractAllDependencies(files);
    
    // Map usage across python files
    const allPkgNames = Array.from(new Set(extractedDeps.flatMap(d => d.items.map(i => i.name))));
    const fileMap = mapPackagesToFiles(files, allPkgNames);

    const newDeps: DependencyItem[] = [];
    
    extractedDeps.forEach(source => {
      source.items.forEach(item => {
        // preserve existing check data if name matches
        const existing = dependencies.find(d => d.name === item.name);
        newDeps.push({
          name: item.name,
          currentVersion: item.version,
          latestVersion: existing?.latestVersion,
          status: existing?.status || 'unknown',
          usageCount: fileMap[item.name]?.length || 0,
          usedInFiles: fileMap[item.name] || [],
          sourceFile: source.file
        });
      });
    });

    // Simple diff check to avoid infinite loop
    if (newDeps.length !== dependencies.length) {
       setDependencies(newDeps);
    }
  }, [files.length]); 

  // Filter repos based on search
  const filteredRepos = useMemo(() => {
    if (!repoSearch) return githubRepos;
    return githubRepos.filter(r => r.full_name.toLowerCase().includes(repoSearch.toLowerCase()));
  }, [githubRepos, repoSearch]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setGlobalError(null);
    setIsProjectAnalyzing(true);
    setDependencies([]);

    try {
      let extractedFiles: ProjectFile[] = [];
      
      if (file.name.endsWith('.zip')) {
        extractedFiles = await extractZip(file);
        if (extractedFiles.length === 0) {
          setGlobalError("No supported text files found in the ZIP archive.");
          setIsProjectAnalyzing(false);
          return;
        }
        setFiles(extractedFiles);
        setSelectedFilePath(PROJECT_ROOT_ID);
      } else {
        const content = await file.text();
        extractedFiles = [{
          path: file.name,
          content,
          language: file.name.endsWith('.py') ? 'python' : 'text',
          status: 'pending'
        }];
        setFiles(extractedFiles);
        setSelectedFilePath(extractedFiles[0].path);
      }
      
      await runBatchAnalysis(extractedFiles);

    } catch (err: any) {
      setGlobalError("Failed to load file: " + err.message);
      setIsProjectAnalyzing(false);
    }
  };

  const handleGithubLogin = async (token: string, user: GitHubUser) => {
    setGithubToken(token);
    setGithubUser(user);
    setIsGithubLoading(true);
    try {
      const repos = await fetchUserRepos(token);
      setGithubRepos(repos);
    } catch (err: any) {
      setGlobalError("Failed to fetch repositories: " + err.message);
    } finally {
      setIsGithubLoading(false);
    }
  };

  const handleDisconnectGithub = () => {
    setGithubUser(null);
    setGithubToken('');
    setGithubRepos([]);
    setSelectedRepoFullName('');
    setFiles([]); 
    setDependencies([]);
    setGlobalError(null);
  };

  const handleImportRepo = async () => {
    if (!selectedRepoFullName) return;
    
    setIsGithubLoading(true);
    setGlobalError(null);
    setDependencies([]);
    
    try {
      const [owner, repo] = selectedRepoFullName.split('/');
      const config: GitHubConfig = {
        repoUrl: `https://github.com/${selectedRepoFullName}`,
        token: githubToken,
        owner,
        repo
      };
      
      const fetchedFiles = await fetchRepoContents(config);
      if (fetchedFiles.length === 0) {
        setGlobalError("No supported files found in the repository (or empty).");
      } else {
        setFiles(fetchedFiles);
        setSelectedFilePath(PROJECT_ROOT_ID); 
        await runBatchAnalysis(fetchedFiles);
      }
    } catch (err: any) {
      setGlobalError("Import Failed: " + err.message);
    } finally {
      setIsGithubLoading(false);
    }
  };

  const handleCreatePR = async () => {
    if (!selectedRepoFullName || !githubToken) {
      setGlobalError("No repository connected.");
      return;
    }

    setPrStatus({ loading: true });
    try {
      const [owner, repo] = selectedRepoFullName.split('/');
      const result = await createPullRequest({
        repoUrl: `https://github.com/${selectedRepoFullName}`,
        token: githubToken,
        owner,
        repo
      }, files);
      setPrStatus({ loading: false, url: result.url });
    } catch (err: any) {
      setPrStatus({ loading: false, error: err.message });
    }
  };

  const updateFileStatus = (path: string, status: ProjectFile['status'], result?: MigrationResult) => {
    setFiles(prev => prev.map(f => 
      f.path === path ? { ...f, status, result } : f
    ));
  };

  const runBatchAnalysis = async (filesToProcess: ProjectFile[]) => {
    setIsProjectAnalyzing(true);
    
    const filesToAnalyze: ProjectFile[] = [];

    for (const file of filesToProcess) {
       if (file.status === 'completed') continue;

       const lowerPath = file.path.toLowerCase();
       const fileName = lowerPath.split('/').pop() || '';

       const isIgnored = 
          fileName === '.gitignore' || 
          fileName === 'readme.md' || 
          fileName === 'license' ||
          fileName.startsWith('.') || 
          lowerPath.includes('__pycache__');

       const isAnalyzable = file.language === 'python' || 
                            lowerPath.includes('requirements') || 
                            lowerPath.includes('lock') || 
                            lowerPath.includes('toml') || 
                            lowerPath.includes('pipfile');
       
       const isEmpty = !file.content || file.content.trim().length === 0;

       if (isIgnored || !isAnalyzable || isEmpty) {
         updateFileStatus(file.path, 'completed'); 
       } else {
         filesToAnalyze.push(file);
       }
    }

    const CONCURRENCY_LIMIT = 4;
    const queue = [...filesToAnalyze];
    
    const analyzeWorker = async () => {
        while (queue.length > 0) {
            const file = queue.shift();
            if (!file) break;
            
            try {
                updateFileStatus(file.path, 'analyzing');
                const result = await analyzeCode(file.content, file.path, targetVersion);
                updateFileStatus(file.path, 'completed', result);
            } catch (err: any) {
                console.error(`Error analyzing ${file.path}:`, err);
                updateFileStatus(file.path, 'error');
            }
        }
    };

    const workers = Array(Math.min(CONCURRENCY_LIMIT, filesToAnalyze.length))
        .fill(null)
        .map(() => analyzeWorker());

    await Promise.all(workers);
    
    setIsProjectAnalyzing(false);
  };

  const handleManualAnalyze = async () => {
    if (selectedFile) {
        setIsProjectAnalyzing(true);
        try {
            updateFileStatus(selectedFile.path, 'analyzing');
            const result = await analyzeCode(selectedFile.content, selectedFile.path, targetVersion);
            updateFileStatus(selectedFile.path, 'completed', result);
            setActiveTab('report');
        } catch(err: any) {
             setGlobalError(err.message);
             updateFileStatus(selectedFile.path, 'error');
        } finally {
            setIsProjectAnalyzing(false);
        }
    }
  };

  const handleGenerateTests = async () => {
    if (!selectedFile) return;
    setIsGeneratingTests(true);
    try {
      const testCode = await generateUnitTests(selectedFile.content, selectedFile.path, targetVersion);
      
      const testFileName = `tests/test_${selectedFile.path.replace(/\//g, '_').replace('.py', '')}.py`;
      
      const newFile: ProjectFile = {
        path: testFileName,
        content: '', 
        language: 'python',
        status: 'completed',
        result: {
          refactoredCode: testCode,
          changes: [{
            type: 'SYNTAX' as any,
            severity: 'LOW' as any,
            lineNumber: 1,
            description: 'Created new unit test file.',
          }],
          summary: "Auto-generated unit tests via Gemini."
        }
      };
      
      setFiles(prev => {
        const filtered = prev.filter(f => f.path !== testFileName);
        return [...filtered, newFile];
      });
      
      setSelectedFilePath(testFileName);
      setActiveTab('code');
    } catch (err: any) {
      setGlobalError("Test Generation Failed: " + err.message);
    } finally {
      setIsGeneratingTests(false);
    }
  };

  const handleChatMessage = async (text: string) => {
    // If no file selected (Dashboard mode), we assume global project query?
    // For MVP, we'll try to use the "selectedFilePath" if available, else warn or use a dummy context.
    const activeFile = selectedFile || files[0]; // fallback
    if (!activeFile) return;

    setIsChatLoading(true);
    
    // Create new history entry
    const newHistory: ChatMessage[] = [
      ...(activeFile.chatHistory || []),
      { role: 'user', text, timestamp: Date.now() }
    ];

    // Optimistic UI update
    setFiles(prev => prev.map(f => 
      f.path === activeFile.path ? { ...f, chatHistory: newHistory } : f
    ));

    try {
      const projectContext = files.map(f => f.path).join('\n');
      
      // Use refactoredCode if available, else content.
      // If we are in Dashboard mode (no selectedFile), we might be chatting about the project. 
      // Current Chat implementation assumes a single file context for "Refactoring".
      // We will simply pass "Project Summary" as code if none exists.
      
      const currentCode = activeFile.result?.refactoredCode || activeFile.content;

      const { code, reply } = await chatRefinement(
        activeFile.content, 
        currentCode, 
        newHistory, 
        text,
        projectContext
      );

      const aiMsg: ChatMessage = { role: 'ai', text: reply, timestamp: Date.now() };
      const updatedHistory = [...newHistory, aiMsg];

      setFiles(prev => prev.map(f => 
        f.path === activeFile.path ? { 
          ...f, 
          chatHistory: updatedHistory,
          // Only update result code if we actually got code back
          result: { 
             ...f.result!, 
             refactoredCode: code || f.result?.refactoredCode || f.content,
             changes: f.result?.changes || [],
             summary: f.result?.summary || 'Updated via Chat'
          }
        } : f
      ));
      
      if (code && code !== currentCode) {
         if (selectedFilePath !== activeFile.path) setSelectedFilePath(activeFile.path);
         setActiveTab('code'); 
      }
    } catch (err: any) {
      setGlobalError("Chat Error: " + err.message);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleCheckUpdates = async () => {
    if (dependencies.length === 0) return;
    setIsCheckingUpdates(true);
    try {
      const updates = await auditDependencyVersions(dependencies.map(d => ({ name: d.name, currentVersion: d.currentVersion })));
      
      setDependencies(prev => prev.map(p => {
        const update = updates.find(u => u.name === p.name);
        if (!update) return p;
        return {
          ...p,
          latestVersion: update.latestVersion,
          status: update.status
        };
      }));
    } catch (err: any) {
      setGlobalError("Failed to check updates: " + err.message);
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleUpgradeDependency = async (pkgName: string, newVersion: string, dependentFiles: string[]) => {
    // Find which file to update
    const dep = dependencies.find(d => d.name === pkgName);
    if (!dep || !dep.sourceFile) return;

    const sourceFile = files.find(f => f.path === dep.sourceFile);
    if (!sourceFile) return;

    // Simple Regex replacement logic
    let newContent = sourceFile.content;
    const escapedName = pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex chars
    
    // Heuristics based on file type
    if (sourceFile.path.endsWith('.txt')) {
       // requirements.txt: name==version
       const regex = new RegExp(`^${escapedName}([=<>!~]+.*)?$`, 'm');
       newContent = sourceFile.content.replace(regex, `${pkgName}==${newVersion}`);
    } else if (sourceFile.path.endsWith('.toml')) {
       // pyproject.toml: name = "version"
       const regex = new RegExp(`^"?${escapedName}"?\\s*=\s*".*"`, 'm');
       if (regex.test(sourceFile.content)) {
         newContent = sourceFile.content.replace(regex, `${pkgName} = "${newVersion}"`);
       } else {
         // Poetry style?
         const poetryRegex = new RegExp(`^${escapedName}\\s*=\s*".*"`, 'm');
         newContent = sourceFile.content.replace(poetryRegex, `${pkgName} = "${newVersion}"`);
       }
    }

    if (newContent !== sourceFile.content) {
       updateFileStatus(sourceFile.path, 'pending');
       setFiles(prev => prev.map(f => {
         if (f.path === sourceFile.path) {
           return { ...f, content: newContent, status: 'pending' };
         }
         if (dependentFiles.includes(f.path)) {
           return { ...f, status: 'pending' };
         }
         return f;
       }));

       setTimeout(() => {
         const filesToReanalyze = [
            { ...sourceFile, content: newContent, status: 'pending' } as ProjectFile,
            ...files.filter(f => dependentFiles.includes(f.path)).map(f => ({ ...f, status: 'pending' } as ProjectFile))
         ];
         runBatchAnalysis(filesToReanalyze);
       }, 100);
       
       setDependencies(prev => prev.map(d => 
         d.name === pkgName ? { ...d, currentVersion: newVersion, status: 'up-to-date' } : d
       ));
    }
  };

  const filesChangedCount = files.filter(f => f.status === 'completed' && f.result?.refactoredCode && f.result.refactoredCode !== f.content).length;

  return (
    <div className="min-h-screen bg-background text-slate-200 font-sans selection:bg-primary/20 flex flex-col h-screen overflow-hidden">
      <Header onToggleChat={() => setIsChatOpen(!isChatOpen)} isChatOpen={isChatOpen} />

      <main className="flex-1 flex overflow-hidden relative">
        
        {/* Sidebar */}
        <aside className="w-80 border-r border-slate-700 bg-surface flex flex-col flex-shrink-0 z-20">
          {/* Source Toggle */}
          <div className="p-4 border-b border-slate-700 bg-slate-900/30">
             <div className="flex bg-slate-800 p-1 rounded-lg mb-4">
                <button 
                  onClick={() => setSourceMode('upload')}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${sourceMode === 'upload' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Upload ZIP
                </button>
                <button 
                  onClick={() => setSourceMode('github')}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${sourceMode === 'github' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  GitHub
                </button>
             </div>

             {sourceMode === 'upload' ? (
                <div className="relative group">
                  <input 
                    type="file" 
                    accept=".zip,.py,.txt,.md" 
                    onChange={handleFileUpload} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-8 bg-slate-800/50 hover:bg-slate-800 border-2 border-dashed border-slate-700 hover:border-slate-500 rounded-lg text-sm transition-all group-hover:text-white">
                    <Upload className="w-5 h-5 mb-1" />
                    <span className="text-xs">Click to Upload ZIP</span>
                  </button>
                </div>
             ) : (
                <div className="space-y-3">
                   {!githubUser ? (
                     <GitHubAuth onLogin={handleGithubLogin} isLoading={isGithubLoading} />
                   ) : (
                     <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                        {/* User Profile Card */}
                        <div className="flex items-center justify-between bg-slate-800/50 p-2.5 rounded-lg border border-slate-700">
                          <div className="flex items-center gap-2.5 overflow-hidden">
                             {githubUser.avatar_url ? (
                               <img src={githubUser.avatar_url} alt="Profile" className="w-8 h-8 rounded-full border border-slate-600" />
                             ) : (
                               <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                 <span className="text-xs font-bold text-primary">{githubUser.login.substring(0, 2).toUpperCase()}</span>
                               </div>
                             )}
                             <div className="flex flex-col min-w-0">
                               <span className="text-xs font-bold text-slate-200 truncate">@{githubUser.login}</span>
                               <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                                 Connected
                               </span>
                             </div>
                          </div>
                          <button 
                            onClick={handleDisconnectGithub} 
                            className="text-slate-500 hover:text-red-400 p-1.5 hover:bg-slate-700 rounded transition-colors" 
                            title="Disconnect Account"
                          >
                            <LogOut className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Repo Search */}
                        <div>
                          <label className="text-[10px] text-slate-400 font-bold uppercase mb-1.5 block flex items-center justify-between">
                            <span>Select Repository</span>
                            <span className="text-slate-600 font-normal">{githubRepos.length} found</span>
                          </label>
                          <div className="relative mb-2">
                             <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
                             <input 
                                type="text"
                                placeholder="Search repositories..."
                                value={repoSearch}
                                onChange={e => setRepoSearch(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-md pl-8 pr-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:outline-none placeholder-slate-600 text-slate-200"
                             />
                          </div>
                          
                          {/* Repo List */}
                          <div className="h-48 overflow-y-auto border border-slate-700 rounded-md bg-slate-900/20 custom-scrollbar">
                             {filteredRepos.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full p-4 text-center text-[10px] text-slate-500">
                                   {isGithubLoading ? <Loader2 className="w-5 h-5 animate-spin mb-2" /> : "No repositories found."}
                                </div>
                             ) : (
                                filteredRepos.map(repo => (
                                  <button
                                    key={repo.id}
                                    onClick={() => setSelectedRepoFullName(repo.full_name)}
                                    className={`w-full text-left px-3 py-2.5 text-xs border-b border-slate-700/30 last:border-0 hover:bg-slate-700/50 transition-colors flex items-center justify-between group ${selectedRepoFullName === repo.full_name ? 'bg-primary/20 text-white' : 'text-slate-300'}`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      {repo.private ? (
                                        <Lock className={`w-3.5 h-3.5 ${selectedRepoFullName === repo.full_name ? 'text-amber-400' : 'text-slate-500 group-hover:text-amber-400'}`} />
                                      ) : (
                                        <Globe className={`w-3.5 h-3.5 ${selectedRepoFullName === repo.full_name ? 'text-primary' : 'text-slate-500 group-hover:text-primary'}`} />
                                      )}
                                      <span className="truncate">{repo.name}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 flex-shrink-0 ml-2 bg-slate-800 px-1.5 py-0.5 rounded">
                                      {repo.owner.login}
                                    </span>
                                  </button>
                                ))
                             )}
                          </div>
                        </div>

                        <button 
                            onClick={handleImportRepo}
                            disabled={!selectedRepoFullName || isGithubLoading}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                        >
                            {isGithubLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            Import Project
                        </button>
                     </div>
                   )}
                </div>
             )}
          </div>
          
          <div className="flex-1 min-h-0">
            <FileTree 
              files={files} 
              selectedFile={selectedFile || null} 
              selectedPath={selectedFilePath}
              onSelect={(path) => {
                setSelectedFilePath(path);
                if (path !== PROJECT_ROOT_ID) {
                   const f = files.find(f => f.path === path);
                   if (f?.status === 'completed') setActiveTab('code');
                }
              }} 
            />
          </div>

          {/* Action Footer */}
          <div className="p-4 border-t border-slate-700 bg-slate-900/50 space-y-2">
             <div className="grid grid-cols-2 gap-2">
               <button
                  onClick={() => createAndDownloadZip(files)}
                  disabled={files.length === 0}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-md text-xs transition-colors disabled:opacity-50"
                  title="Download Code as ZIP"
               >
                  <Download className="w-3 h-3" /> ZIP
               </button>
               <button
                  onClick={() => generateMigrationReport(files)}
                  disabled={files.length === 0}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-md text-xs transition-colors disabled:opacity-50"
                  title="Download Report as PDF"
               >
                  <FileText className="w-3 h-3" /> PDF
               </button>
             </div>

             {sourceMode === 'github' && githubUser && (
                <button
                  onClick={handleCreatePR}
                  disabled={prStatus?.loading || isProjectAnalyzing || !selectedRepoFullName || filesChangedCount === 0}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
                >
                   {prStatus?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitPullRequest className="w-3.5 h-3.5" />}
                   {filesChangedCount > 0 ? `Create PR (${filesChangedCount} files)` : 'Create Pull Request'}
                </button>
             )}
             
             {prStatus?.url && (
                <a href={prStatus.url} target="_blank" rel="noreferrer" className="block text-center text-[10px] text-emerald-400 hover:underline bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20">
                  <span className="flex items-center justify-center gap-1">
                    <Check className="w-3 h-3" /> PR Created Successfully
                  </span>
                </a>
             )}
             {prStatus?.error && (
                <div className="text-[10px] text-red-400 text-center px-1 break-words bg-red-500/10 p-1.5 rounded border border-red-500/20">
                   Error: {prStatus.error}
                </div>
             )}
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-background relative z-10">
          
          {selectedFilePath === PROJECT_ROOT_ID ? (
             <ProjectDashboard 
               files={files} 
               isAnalyzing={isProjectAnalyzing}
               onSelectFile={setSelectedFilePath}
               dependencies={dependencies}
               onCheckUpdates={handleCheckUpdates}
               onUpgradeDependency={handleUpgradeDependency}
               isCheckingUpdates={isCheckingUpdates}
             />
          ) : (
            <>
              {/* Toolbar */}
              <div className="h-14 border-b border-slate-700 flex items-center justify-between px-6 bg-surface/30 backdrop-blur">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setSelectedFilePath(PROJECT_ROOT_ID)}
                    className="p-1.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors mr-1"
                    title="Back to Dashboard"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <div className="p-1.5 bg-slate-800 rounded-md text-slate-400">
                    <FolderOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-mono text-sm text-slate-200 block max-w-[300px] truncate">{selectedFile?.path || 'No file selected'}</span>
                    {selectedFile?.status === 'completed' && (
                      <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Analyzed
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Unit Test Button */}
                   {selectedFile?.language === 'python' && (
                      <button
                        onClick={handleGenerateTests}
                        disabled={isGeneratingTests || isProjectAnalyzing}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs font-medium border border-slate-600 transition-all disabled:opacity-50"
                        title="Generate pytest unit tests"
                      >
                         {isGeneratingTests ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
                         Generate Tests
                      </button>
                   )}

                  <div className="h-6 w-px bg-slate-700 mx-1" />

                  <div className="flex items-center gap-2 bg-slate-800/50 p-1 rounded-lg border border-slate-700">
                    <span className="text-[10px] text-slate-400 font-bold px-2 uppercase">Target</span>
                    <select 
                      value={targetVersion}
                      onChange={(e) => setTargetVersion(e.target.value as TargetVersion)}
                      className="bg-transparent border-none text-slate-200 text-xs focus:ring-0 cursor-pointer py-1"
                    >
                      {Object.values(TargetVersion).map((v) => (
                        <option key={v} value={v} className="bg-slate-800">{v}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleManualAnalyze}
                    disabled={isProjectAnalyzing || !selectedFile}
                    className="flex items-center gap-2 px-4 py-1.5 bg-primary hover:bg-blue-600 text-white rounded-md text-xs font-semibold transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    {selectedFile?.status === 'analyzing' ? 'Analyzing...' : 'Run Analysis'}
                  </button>
                </div>
              </div>

              {/* Error Banner */}
              {globalError && (
                <div className="bg-red-500/10 border-b border-red-500/20 text-red-400 p-2 px-6 flex items-center gap-2 text-xs">
                  <AlertCircle className="w-4 h-4" />
                  {globalError}
                </div>
              )}

              {/* Editor & Results Split */}
              <div className="flex-1 flex min-h-0 relative">
                {/* Left/Main Column: Editors */}
                <div className="flex-1 flex flex-col min-h-0 min-w-0">
                  <div className="flex-1 flex min-h-0">
                    {/* Left Column: Original Code (Hidden if diff mode, or shown as source) */}
                    <div className={`flex flex-col min-w-[300px] border-r border-slate-700/50 overflow-hidden ${activeTab === 'diff' ? 'hidden' : 'flex-1'}`}>
                        <div className="flex-1 p-4 pb-0 overflow-hidden h-full">
                          <Editor 
                            label="Current File Content" 
                            code={selectedFile?.content || ''} 
                            onChange={(val) => {
                              setFiles(prev => prev.map(f => f.path === selectedFile?.path ? { ...f, content: val, status: 'pending' } : f));
                            }}
                            readOnly={false}
                          />
                        </div>
                    </div>

                    {/* Right Column: Results (Tabs) */}
                    <div className="flex-1 flex flex-col min-w-[300px] bg-slate-900/20 overflow-hidden">
                        {selectedFile?.result ? (
                          <>
                            {/* Tabs */}
                            <div className="flex items-center border-b border-slate-700 px-4 pt-2 gap-1 flex-shrink-0">
                              <button 
                                onClick={() => setActiveTab('report')}
                                className={`
                                  flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-t border-x
                                  ${activeTab === 'report' 
                                    ? 'bg-surface border-slate-700 text-primary border-b-surface mb-[-1px] z-10' 
                                    : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                                  }
                                `}
                              >
                                <BarChart3 className="w-3.5 h-3.5" />
                                Report
                              </button>
                              <button 
                                onClick={() => setActiveTab('code')}
                                className={`
                                  flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-t border-x
                                  ${activeTab === 'code' 
                                    ? 'bg-surface border-slate-700 text-emerald-400 border-b-surface mb-[-1px] z-10' 
                                    : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                                  }
                                `}
                              >
                                <Code2 className="w-3.5 h-3.5" />
                                Refactored
                              </button>
                              <button 
                                onClick={() => setActiveTab('diff')}
                                className={`
                                  flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-t border-x
                                  ${activeTab === 'diff' 
                                    ? 'bg-surface border-slate-700 text-amber-400 border-b-surface mb-[-1px] z-10' 
                                    : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                                  }
                                `}
                              >
                                <GitCompare className="w-3.5 h-3.5" />
                                Diff
                              </button>
                            </div>

                            {/* Tab Content */}
                            <div className="flex-1 min-h-0 p-4 relative bg-surface/30 overflow-hidden">
                              {activeTab === 'code' && (
                                <Editor 
                                  label="AI Refactored Result" 
                                  code={selectedFile.result.refactoredCode} 
                                  readOnly={true} 
                                  className="h-full shadow-xl"
                                />
                              )}
                              {activeTab === 'report' && (
                                <ChangeLog 
                                  changes={selectedFile.result.changes} 
                                  summary={selectedFile.result.summary} 
                                  references={selectedFile.result.references}
                                />
                              )}
                              {activeTab === 'diff' && (
                                <div className="h-full bg-[#0a0f1e] rounded-xl border border-slate-700 overflow-hidden">
                                  <DiffViewer original={selectedFile.content} modified={selectedFile.result.refactoredCode} />
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                              <div className="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mb-6 relative">
                                {isProjectAnalyzing ? (
                                  <>
                                    <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin"></div>
                                    <Loader2 className="w-8 h-8 text-primary" />
                                  </>
                                ) : (
                                  <FileCode className="w-8 h-8 opacity-50" />
                                )}
                              </div>
                              <h3 className="text-lg font-medium text-slate-200 mb-2">
                                {isProjectAnalyzing ? 'Analyzing Codebase...' : 'Ready to Analyze'}
                              </h3>
                              <p className="text-sm max-w-sm leading-relaxed text-slate-400">
                                {isProjectAnalyzing 
                                  ? 'Our AI agents are scanning PyPI for updates, checking vulnerabilities, and refactoring your code.' 
                                  : 'Select a file to view detailed changes.'}
                              </p>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Global Chat Overlay/Split - Rendered LAST to be on top of everything if needed */}
          {isChatOpen && (
             <div className="absolute right-0 top-0 bottom-0 w-96 bg-surface border-l border-slate-700 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
                <ChatPanel 
                  messages={selectedFile?.chatHistory || []} 
                  onSendMessage={handleChatMessage} 
                  isLoading={isChatLoading}
                  onClose={() => setIsChatOpen(false)}
                />
             </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;