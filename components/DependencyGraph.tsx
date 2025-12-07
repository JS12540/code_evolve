import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { DependencyGraphData } from '../types';
import { Loader2, AlertCircle, ZoomIn, ZoomOut, Move, RefreshCcw, Layout, ArrowRightLeft, ArrowDown } from 'lucide-react';

interface DependencyGraphProps {
  data: DependencyGraphData;
}

const DependencyGraph: React.FC<DependencyGraphProps> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  const [svg, setSvg] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // View State
  const [layoutDir, setLayoutDir] = useState<'TD' | 'LR'>('TD');
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    mermaid.initialize({ 
      startOnLoad: false, 
      theme: 'dark', 
      securityLevel: 'loose',
      fontFamily: 'monospace',
    });
  }, []);

  useEffect(() => {
    const renderGraph = async () => {
      if (data.nodes.length === 0) {
        setSvg('');
        return;
      }

      setGenerating(true);
      setError(null);
      
      try {
        let graphDefinition = `graph ${layoutDir};\n`;
        
        // Helper to sanitize IDs for Mermaid
        const sanitizeId = (id: string) => 'node_' + id.replace(/[^a-zA-Z0-9]/g, '_');

        // Add Nodes
        data.nodes.forEach(node => {
           const cleanId = sanitizeId(node.id);
           let style = '';
           
           if (node.group === 2) style = ':::python'; 
           else if (node.group === 3) style = ':::test';
           else if (node.group === 4) style = ':::config';
           else style = ':::other';

           // Truncate label if too long
           let label = node.id;
           if (label.length > 25) {
             const parts = label.split('/');
             label = parts.length > 1 ? `.../${parts[parts.length - 1]}` : label;
           }

           graphDefinition += `${cleanId}["${label}"]${style};\n`;
        });

        // Add Links
        data.links.forEach(link => {
           const source = sanitizeId(link.source);
           const target = sanitizeId(link.target);
           graphDefinition += `${source}-->${target};\n`;
        });
        
        // Define Styles
        graphDefinition += `
          classDef python fill:#172554,stroke:#3b82f6,stroke-width:1px,color:#dbeafe;
          classDef test fill:#3f3f46,stroke:#71717a,stroke-width:1px,color:#d4d4d8;
          classDef config fill:#064e3b,stroke:#10b981,stroke-width:1px,color:#ecfdf5;
          classDef other fill:#1e293b,stroke:#475569,stroke-width:1px,color:#94a3b8;
          linkStyle default stroke:#64748b,stroke-width:1px;
        `;

        const { svg } = await mermaid.render(`mermaid-graph-${Date.now()}`, graphDefinition);
        setSvg(svg);
        // Reset view on new data/layout
        setScale(1);
        setPosition({ x: 0, y: 0 });
      } catch (e: any) {
        console.error("Mermaid failed", e);
        setError("Could not render dependency graph. The project structure might be too complex or contain circular dependencies.");
      } finally {
        setGenerating(false);
      }
    };

    renderGraph();
  }, [data, layoutDir]);

  // Zoom/Pan Handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault(); // Stop page scroll usually handled by passive: false in real DOM
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(scale * delta, 0.1), 5);
    setScale(newScale);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="w-full h-full bg-[#0f172a] overflow-hidden flex flex-col relative">
       {/* Controls Toolbar */}
       <div className="absolute top-4 left-4 z-20 flex gap-2">
         <div className="bg-slate-800/90 backdrop-blur rounded-lg border border-slate-700 p-1 flex items-center gap-1 shadow-xl">
           <button 
             onClick={() => setScale(s => Math.min(s + 0.2, 5))}
             className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors" 
             title="Zoom In"
           >
             <ZoomIn className="w-4 h-4" />
           </button>
           <span className="text-[10px] w-8 text-center text-slate-500 font-mono">{Math.round(scale * 100)}%</span>
           <button 
             onClick={() => setScale(s => Math.max(s - 0.2, 0.1))}
             className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors" 
             title="Zoom Out"
           >
             <ZoomOut className="w-4 h-4" />
           </button>
           <div className="w-px h-4 bg-slate-700 mx-1"></div>
           <button 
             onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }}
             className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors" 
             title="Reset View"
           >
             <RefreshCcw className="w-4 h-4" />
           </button>
         </div>

         <div className="bg-slate-800/90 backdrop-blur rounded-lg border border-slate-700 p-1 flex items-center gap-1 shadow-xl">
            <button 
               onClick={() => setLayoutDir('TD')}
               className={`flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold rounded transition-colors ${layoutDir === 'TD' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
             >
               <ArrowDown className="w-3 h-3" /> Top-Down
             </button>
             <button 
               onClick={() => setLayoutDir('LR')}
               className={`flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold rounded transition-colors ${layoutDir === 'LR' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
             >
               <ArrowRightLeft className="w-3 h-3" /> Left-Right
             </button>
         </div>
       </div>

       {generating && (
         <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 z-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
            <span className="text-xs text-slate-400">Analyzing structure...</span>
         </div>
       )}
       
       {error ? (
         <div className="flex flex-col items-center justify-center h-full text-slate-500">
           <AlertCircle className="w-8 h-8 text-red-500/50 mb-2" />
           <p className="text-sm max-w-md text-center">{error}</p>
         </div>
       ) : (
         <div 
           ref={wrapperRef}
           className="w-full h-full overflow-hidden cursor-move bg-grid-pattern"
           onWheel={handleWheel}
           onMouseDown={handleMouseDown}
           onMouseMove={handleMouseMove}
           onMouseUp={handleMouseUp}
           onMouseLeave={handleMouseUp}
           style={{
             backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)',
             backgroundSize: '20px 20px'
           }}
         >
           <div 
             ref={containerRef} 
             dangerouslySetInnerHTML={{ __html: svg }} 
             style={{
               transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
               transformOrigin: 'center center',
               transition: isDragging ? 'none' : 'transform 0.1s ease-out'
             }}
             className="w-full h-full flex items-center justify-center p-8 pointer-events-none" 
             // pointer-events-none on the SVG container lets mouse events pass to the wrapper for drag
           />
         </div>
       )}
       
       <div className="absolute bottom-4 right-4 bg-slate-900/90 p-2 rounded-lg border border-slate-700 text-[10px] text-slate-400 flex flex-col gap-1 z-10 shadow-lg backdrop-blur">
          <div className="font-bold mb-1 border-b border-slate-700 pb-1">Legend</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#3b82f6]"></div> Python Files</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#10b981]"></div> Config / Deps</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#71717a]"></div> Tests</div>
       </div>
    </div>
  );
};

export default DependencyGraph;