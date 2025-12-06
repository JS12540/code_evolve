import { GoogleGenAI } from "@google/genai";
import { MigrationResult, TargetVersion, ChangeType, Severity, Reference } from "../types";

const apiKey = process.env.API_KEY || '';

export const analyzeCode = async (
  code: string,
  filename: string,
  targetVersion: TargetVersion
): Promise<MigrationResult> => {
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const isDependencyFile = filename.endsWith('requirements.txt') || 
                           filename.endsWith('pyproject.toml') || 
                           filename.endsWith('Pipfile') ||
                           filename.includes('lock');

  let systemInstruction = '';
  
  if (isDependencyFile) {
    systemInstruction = `
      You are a Senior Python Dependency Expert and Security Analyst.
      
      YOUR GOAL:
      Analyze the provided dependency file (${filename}). 
      You MUST USE the built-in Search tool to find the absolute latest stable versions on PyPI for every package listed.
      
      STEPS:
      1. Identify every package and its current version constraint.
      2. SEARCH PyPI for the latest stable version of each package compatible with ${targetVersion}.
      3. SEARCH for known vulnerabilities (CVEs) associated with the *current* version.
      4. SEARCH for deprecation notices or breaking changes if upgrading to the latest version.
      5. Generate a 'refactoredCode' version of the file with upgraded versions (preserving structure).
      
      OUTPUT FORMAT:
      Return a pure JSON object (no markdown formatting).
    `;
  } else {
    systemInstruction = `
      You are a Senior Python Migration Engineer and Code Quality Expert.
      
      YOUR GOAL:
      Analyze the provided Python code (${filename}) and upgrade it to ${targetVersion}.
      
      STEPS:
      1. Analyze imports. If you see imports like 'pandas', 'numpy', 'pydantic', etc., USE SEARCH to check if the usage in the code matches the latest API patterns.
      2. Identify DEPRECATED functions or patterns for ${targetVersion}.
      3. Identify SECURITY vulnerabilities (SQLi, XSS, etc.).
      4. Fix SYNTAX issues.
      5. ENFORCE RUFF & PRE-COMMIT STANDARDS: 
         - Check for unused imports (F401), undefined names (F821), and standard linting errors.
         - Ensure imports are sorted (isort style).
         - Fix formatting inconsistencies (Black style).
         - Raise ANY violation of these rules as a specific change with severity 'LOW' and type 'STYLE' or 'PERFORMANCE'.
      
      OUTPUT FORMAT:
      Return a pure JSON object (no markdown formatting).
    `;
  }

  const prompt = `
    FILENAME: ${filename}
    CONTENT:
    ${code}

    ----------------
    Produce a JSON response with this structure:
    {
      "refactoredCode": "string (the full updated file content)",
      "summary": "string (brief summary of changes)",
      "changes": [
        {
          "type": "${ChangeType.DEPRECATION} | ${ChangeType.SECURITY} | ${ChangeType.SYNTAX} | ${ChangeType.PERFORMANCE} | ${ChangeType.STYLE} | ${ChangeType.DEPENDENCY}",
          "severity": "${Severity.HIGH} | ${Severity.MEDIUM} | ${Severity.LOW}",
          "lineNumber": number,
          "description": "string",
          "originalSnippet": "string"
        }
      ]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: [
        { role: "user", parts: [{ text: prompt }] }
      ],
      config: {
        // When using tools like googleSearch, responseSchema is NOT supported. 
        // We must parse the JSON manually.
        tools: [{ googleSearch: {} }], 
        systemInstruction: systemInstruction,
        temperature: 0.1, // Low temperature for consistent JSON
      },
    });

    // 1. Parse Text Result
    const responseText = response.text || "";
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let result: MigrationResult;
    try {
      result = JSON.parse(cleanJson) as MigrationResult;
    } catch (e) {
      console.warn("Failed to parse JSON directly, attempting fallback or returning raw text.", e);
      // Fallback for malformed JSON (basic recovery)
      result = {
        refactoredCode: code, // Return original if parse fails
        changes: [{
          type: ChangeType.STYLE,
          severity: Severity.LOW,
          lineNumber: 0,
          description: "AI response was not valid JSON. Please try again.",
          originalSnippet: ""
        }],
        summary: "Analysis failed to produce structured data."
      };
    }

    // 2. Extract Grounding Metadata (Sources)
    const candidates = response.candidates || [];
    const groundingMetadata = candidates[0]?.groundingMetadata;
    const references: Reference[] = [];

    if (groundingMetadata?.groundingChunks) {
      groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title) {
          references.push({
            title: chunk.web.title,
            url: chunk.web.uri
          });
        }
      });
    }

    // Deduplicate references
    const uniqueRefs = references.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i);
    result.references = uniqueRefs;

    return result;

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};