import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { DependencyGraphData } from '../types';
import { Loader2, AlertCircle } from 'lucide-react';

interface DependencyGraphProps {
  data: DependencyGraphData;
}

const DependencyGraph: React.FC<DependencyGraphProps> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        let graphDefinition = 'graph TD;\n';
        
        // Helper to sanitize IDs for Mermaid
        // Replaces all non-alphanumeric chars with underscore, ensures no starting number
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
      } catch (e: any) {
        console.error("Mermaid failed", e);
        setError("Could not render dependency graph. The project structure might be too complex or contain circular dependencies.");
      } finally {
        setGenerating(false);
      }
    };

    renderGraph();
  }, [data]);

  return (
    <div className="w-full h-full bg-[#0f172a] overflow-hidden flex flex-col relative">
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
           ref={containerRef} 
           dangerouslySetInnerHTML={{ __html: svg }} 
           className="w-full h-full overflow-auto flex items-center justify-center p-8 custom-scrollbar"
         />
       )}
       
       <div className="absolute bottom-4 right-4 bg-slate-900/90 p-2 rounded-lg border border-slate-700 text-[10px] text-slate-400 flex flex-col gap-1 z-10 shadow-lg">
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#3b82f6]"></div> Python Files</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#10b981]"></div> Config</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#71717a]"></div> Tests</div>
       </div>
    </div>
  );
};

export default DependencyGraph;