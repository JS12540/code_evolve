import { GoogleGenAI } from "@google/genai";
import { MigrationResult, TargetVersion, ChangeType, Severity, Reference, ChatMessage, DependencyItem } from "../types";

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
      5. CHECK RUFF & PRE-COMMIT COMPLIANCE: 
         - Check for unused imports (F401), undefined names (F821), and standard linting errors.
         - Check if imports are sorted (isort style) and formatting follows Black.
         - CRITICAL: If the code ALREADY follows these standards, DO NOT generate a change entry. Only report 'LOW' severity 'STYLE' changes if you actually fix a specific violation.
         - Do not report "Code looks good" as a change. Only reports deviations.
      
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

export const generateUnitTests = async (
  code: string,
  filename: string,
  targetVersion: TargetVersion
): Promise<string> => {
  if (!apiKey) throw new Error("API Key is missing.");

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    Generate a comprehensive 'pytest' unit test file for the following Python code.
    FILENAME: ${filename}
    CODE:
    ${code}

    Requirements:
    - Use 'pytest' fixtures where appropriate.
    - Cover success scenarios.
    - Cover edge cases and error handling.
    - Mock external dependencies (APIs, DBs, files) using 'unittest.mock'.
    - Target Python Version: ${targetVersion}.
    - Return ONLY the raw python code for the test file. Do not wrap in markdown code blocks if possible, or I will strip them.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.2 }
  });

  return (response.text || "").replace(/```python/g, '').replace(/```/g, '').trim();
};

export const chatRefinement = async (
  originalCode: string,
  currentCode: string,
  chatHistory: ChatMessage[],
  newMessage: string,
  projectContext: string = ""
): Promise<{ code: string; reply: string }> => {
  if (!apiKey) throw new Error("API Key is missing.");

  const ai = new GoogleGenAI({ apiKey });

  const historyParts = chatHistory.map(msg => ({
    role: msg.role === 'ai' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));

  const systemInstruction = `
    You are an intelligent coding assistant helping a user refactor Python code in a larger project.
    
    CONTEXT:
    - You have the 'Original Code' and the 'Current Refactored State'.
    - You have a list of other files in the project ('Project Context'). Use this to infer imports or project structure if asked.
    
    INSTRUCTIONS:
    If the user asks to modify the code:
    1. Apply the changes to the 'Current Code'.
    2. Return the FULL updated code in the JSON response.
    3. Provide a conversational reply explaining what you did.

    If the user asks a question:
    1. Return the 'Current Code' unchanged (or empty if no code provided).
    2. Answer the question in the reply.

    OUTPUT FORMAT:
    JSON Object: { "code": "...", "reply": "..." }
  `;

  const prompt = `
    PROJECT FILES:
    ${projectContext}

    ORIGINAL CODE:
    ${originalCode}

    CURRENT CODE:
    ${currentCode}

    USER REQUEST:
    ${newMessage}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      ...historyParts as any,
      { role: "user", parts: [{ text: prompt }] }
    ],
    config: {
      systemInstruction,
      responseMimeType: "application/json"
    }
  });

  const responseText = response.text || "{}";
  try {
    return JSON.parse(responseText);
  } catch (e) {
    return { code: currentCode, reply: "I'm sorry, I couldn't process that request correctly." };
  }
};

export const auditDependencyVersions = async (
  packages: { name: string, currentVersion: string }[]
): Promise<Pick<DependencyItem, 'name' | 'currentVersion' | 'latestVersion' | 'status'>[]> => {
  if (!apiKey) throw new Error("API Key is missing.");
  const ai = new GoogleGenAI({ apiKey });

  if (packages.length === 0) return [];

  // Construct a prompt to check all packages at once
  const packageList = packages.map(p => `${p.name} (Current: ${p.currentVersion})`).join('\n');

  const prompt = `
    I have the following Python packages and their current versions:
    ${packageList}

    Task:
    1. For each package, SEARCH for the latest stable version on PyPI.
    2. Compare the current version with the latest.
    3. Return a JSON array of objects.
    
    Output JSON Format:
    [
      {
        "name": "package_name",
        "currentVersion": "current_version_string",
        "latestVersion": "latest_version_string",
        "status": "outdated" | "up-to-date" | "unknown"
      },
      ...
    ]
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.1 // strict parsing
    }
  });

  const responseText = response.text || "[]";
  const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    const items = JSON.parse(cleanJson);
    return items.map((item: any) => ({
      name: item.name,
      currentVersion: item.currentVersion,
      latestVersion: item.latestVersion,
      status: item.status
    }));
  } catch (e) {
    console.error("Failed to parse dependency audit", e);
    return packages.map(p => ({
      name: p.name,
      currentVersion: p.currentVersion,
      latestVersion: '?',
      status: 'unknown' as const
    }));
  }
};
