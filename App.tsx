
import React, { useState, useMemo } from 'react';
import Header from './components/Header';
import Editor from './components/Editor';
import ChangeLog from './components/ChangeLog';
import FileTree from './components/FileTree';
import GitHubAuth from './components/GitHubAuth';
import ProjectDashboard from './components/ProjectDashboard';
import { analyzeCode } from './services/geminiService';
import { extractZip, createAndDownloadZip } from './services/zipService';
import { fetchRepoContents, createPullRequest, fetchUserRepos } from './services/githubService';
import { generateMigrationReport } from './services/pdfService';
import { MigrationResult, TargetVersion, ProjectFile, GitHubConfig, GitHubUser, GitHubRepo } from './types';
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
  ArrowLeft
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
  // Defaults to dashboard view if more than 1 file, else the specific file
  const [selectedFilePath, setSelectedFilePath] = useState<string>('example.py');
  const [targetVersion, setTargetVersion] = useState<TargetVersion>(TargetVersion.PY_3_12);
  const [isProjectAnalyzing, setIsProjectAnalyzing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  
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

  // Right panel view state
  const [activeTab, setActiveTab] = useState<'report' | 'code'>('report');

  const selectedFile = files.find(f => f.path === selectedFilePath);

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
    setGlobalError(null);
  };

  const handleImportRepo = async () => {
    if (!selectedRepoFullName) return;
    
    setIsGithubLoading(true);
    setGlobalError(null);
    
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
        setSelectedFilePath(PROJECT_ROOT_ID); // Go to dashboard
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
      }, files); // Pass ALL files, the service filters for changes
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
    
    for (const file of filesToProcess) {
       // Re-evaluate 'completed' files only if forced? For now, skip.
       if (file.status === 'completed') continue;

       const isAnalyzable = file.language === 'python' || 
                            file.path.includes('requirements') || 
                            file.path.includes('lock') || 
                            file.path.includes('toml');

       if (!isAnalyzable) continue;

       try {
         updateFileStatus(file.path, 'analyzing');
         const result = await analyzeCode(file.content, file.path, targetVersion);
         updateFileStatus(file.path, 'completed', result);
       } catch (err: any) {
         console.error(`Error analyzing ${file.path}:`, err);
         updateFileStatus(file.path, 'error');
       }
    }
    
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

  const filesChangedCount = files.filter(f => f.status === 'completed' && f.result?.refactoredCode && f.result.refactoredCode !== f.content).length;

  return (
    <div className="min-h-screen bg-background text-slate-200 font-sans selection:bg-primary/20 flex flex-col h-screen overflow-hidden">
      <Header />

      <main className="flex-1 flex overflow-hidden">
        
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
              onSelect={(path) => setSelectedFilePath(path)} 
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

                <div className="flex items-center gap-4">
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
              <div className="flex-1 flex min-h-0">
                {/* Left Column: Original Code */}
                <div className="flex-1 flex flex-col min-w-[300px] border-r border-slate-700/50">
                    <div className="flex-1 p-4 pb-0">
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
                <div className="flex-1 flex flex-col min-w-[300px] bg-slate-900/20">
                    {selectedFile?.result ? (
                      <>
                        {/* Tabs */}
                        <div className="flex items-center border-b border-slate-700 px-4 pt-2 gap-1">
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
                            Migration Report
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
                            Refactored Code
                          </button>
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 min-h-0 p-4 relative bg-surface/30">
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
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
