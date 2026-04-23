import * as vscode from "vscode";
import { randomUUID } from "crypto";
import { getWebviewContent } from "./webview/panel";
import { ensureProviderConfigured, runSetupFlow } from "./services/setupService";
import { runAiRequest } from "./services/aiRouter";
const diagnosticCollection = vscode.languages.createDiagnosticCollection("aiCodeReviewer");
let webviewPanel: vscode.WebviewPanel | undefined;
let currentCode = "";
let currentLanguage = "";
let providerStatusBar: vscode.StatusBarItem;
let currentIssues: any[] = [];
let autoReviewEnabled = false;
let isReviewing = false;
let reviewTimeout: NodeJS.Timeout | undefined;


const LANGUAGE_MAP: Record<string, string> = {
  python: "Python", javascript: "JavaScript", typescript: "TypeScript",
  java: "Java", cpp: "C++", c: "C", go: "Go", rust: "Rust",
  php: "PHP", ruby: "Ruby", swift: "Swift", kotlin: "Kotlin",
  csharp: "C#", html: "HTML", css: "CSS", sql: "SQL",
  shellscript: "Shell", yaml: "YAML", json: "JSON", dart: "Dart"
};

function detectLanguage(document: vscode.TextDocument): string {
  const vscodeLang = LANGUAGE_MAP[document.languageId];
  if (vscodeLang) return vscodeLang;
  const ext = document.fileName.split(".").pop()?.toLowerCase() || "";
  const extMap: Record<string, string> = {
    py: "Python", js: "JavaScript", ts: "TypeScript",
    java: "Java", cpp: "C++", cc: "C++", c: "C",
    go: "Go", rs: "Rust", php: "PHP", rb: "Ruby",
    swift: "Swift", kt: "Kotlin", cs: "C#", dart: "Dart"
  };
  if (extMap[ext]) return extMap[ext];
  const code = document.getText();
  if (code.includes("def ") && code.includes("import ")) return "Python";
  if (code.includes("function ") && code.includes("const ")) return "JavaScript";
  if (code.includes("public class ")) return "Java";
  if (code.includes("#include")) return "C++";
  if (code.includes("func ") && code.includes("package ")) return "Go";
  return document.languageId || "Unknown";
}


function saveScoreHistory(context: vscode.ExtensionContext, score: number, language: string) {
  const history: any[] = context.globalState.get("scoreHistory", []);
  history.push({
    score,
    language,
    date: new Date().toISOString(),
    issues: currentIssues.length
  });
  // Keep only last 30 entries
  if (history.length > 30) history.shift();
  context.globalState.update("scoreHistory", history);
}

function getScoreHistory(context: vscode.ExtensionContext): any[] {
  return context.globalState.get("scoreHistory", []);
}

function calculateStreak(history: any[]): number {
  if (history.length < 2) return 0;
  let streak = 0;
  for (let i = history.length - 1; i > 0; i--) {
    if (history[i].score > history[i - 1].score) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}



async function getAIReview(
  context: vscode.ExtensionContext,
  code: string,
  language: string
) {
  const content = await runAiRequest(
    context,
    `You are an expert code reviewer. Analyze the code and return ONLY a JSON array of issues.
Each issue must have:
- line: line number (starting from 1)
- severity: "error" | "warning" | "info"
- message: short description of the issue
- category: "bug" | "performance" | "security" | "style"
- concept: the programming concept related to this issue
Return ONLY valid JSON array. No explanation. No markdown.`,
    `Review this ${language} code:\n\n${code}`
  );

  const cleaned = content.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}


async function getAutoFix(
  context: vscode.ExtensionContext,
  code: string,
  language: string,
  issues: any[]
): Promise<string> {
  const issueList = issues.map(i => `Line ${i.line}: ${i.message}`).join("\n");

  return await runAiRequest(
    context,
    `You are an expert ${language} developer. Fix all the bugs in the code.
Return ONLY the complete fixed code. No explanation. No markdown.`,
    `Fix these issues in this ${language} code.\n\nIssues:\n${issueList}\n\nCode:\n${code}`
  );
}


async function getUnitTests(
  context: vscode.ExtensionContext,
  code: string,
  language: string
): Promise<string> {
  return await runAiRequest(
    context,
    `You are an expert software engineer. Generate comprehensive unit tests.
Use the appropriate testing framework for ${language}.
Return ONLY the test code. No explanation.`,
    `Generate unit tests for this ${language} code:\n\n${code}`
  );
}


async function getChatResponse(
  context: vscode.ExtensionContext,
  code: string,
  language: string,
  question: string
): Promise<string> {
  return await runAiRequest(
    context,
    `You are an expert code reviewer helping a developer understand their ${language} code.
Be concise, clear and helpful.`,
    `Code:\n${code}\n\nQuestion: ${question}`,
    1024
  );
}


async function getLearnContent(
  context: vscode.ExtensionContext,
  concept: string,
  language: string
): Promise<string> {
  return await runAiRequest(
    context,
    `You are an expert ${language} programming teacher.
VERY IMPORTANT RULES:
- ALL code examples MUST be written in ${language} ONLY
- Do NOT use any other programming language
- Every single line of code must be valid ${language} code

Format your response EXACTLY like this:

📌 What is "${concept}"?
[explain in 2-3 simple sentences]

⚠️ Why is it a problem?
[explain why this causes bugs]

❌ WRONG ${language} code:
[show a short BAD example in ${language}]

✅ CORRECT ${language} code:
[show the FIXED example in ${language}]

💡 How to avoid this in ${language}:
[1-2 practical tips specific to ${language}]`,
    `I am writing ${language} code and found a "${concept}" issue.
Teach me using ONLY ${language} code examples.`,
    1024
  );
}


async function getCodeExplanation(
  context: vscode.ExtensionContext,
  code: string,
  language: string
): Promise<string> {
  return await runAiRequest(
    context,
    `You are an expert ${language} developer and teacher.
Explain the provided code in simple, clear language.

Format your response EXACTLY like this:

📋 Overview:
[What does this code do overall in 2-3 sentences]

🔍 Function by Function:
[For each function/method, explain what it does in 1-2 sentences]

📥 Inputs & 📤 Outputs:
[What goes in and what comes out]

⚙️ How it works (step by step):
[Break down the logic simply]

💡 Key concepts used:
[List main programming concepts this code uses]`,
    `Explain this ${language} code clearly:\n\n${code}`,
    1500
  );
}


async function getRefactorSuggestions(
  context: vscode.ExtensionContext,
  code: string,
  language: string
): Promise<string> {
  return await runAiRequest(
    context,
    `You are an expert ${language} developer specializing in clean code.
Analyze the code and suggest specific refactoring improvements.
ALL code examples MUST be in ${language} ONLY.

Format your response EXACTLY like this:

🔄 Refactoring Suggestions:

[For each suggestion use this format:]
❌ Issue: [what is wrong]
✅ Better way: [how to fix it]
📝 Example in ${language}:
[show before and after code in ${language}]

---

[Next suggestion...]

💯 Summary:
[Overall assessment and top 3 priorities]`,
    `Suggest refactoring improvements for this ${language} code:\n\n${code}`,
    2048
  );
}


async function getCommitMessage(
  context: vscode.ExtensionContext,
  code: string,
  language: string,
  issues: any[]
): Promise<string> {
  const issueList = issues
    .map(i => `- ${i.category}: ${i.message} (line ${i.line})`)
    .join("\n");

  return await runAiRequest(
    context,
    `You are an expert software engineer who writes excellent git commit messages.
Follow conventional commits format: type(scope): description

Types: feat, fix, security, perf, refactor, style, docs, test, chore

Generate 3 different commit message options based on the code and issues found.

Format EXACTLY like this:

Option 1 (if fixing bugs):
fix(scope): [message]

Option 2 (if adding features):
feat(scope): [message]

Option 3 (detailed multi-line):
fix(scope): [short description]

- [detail 1]
- [detail 2]
- [detail 3]`,
    `Generate git commit messages for this ${language} code.

Issues found:
${issueList}

Code summary (first 50 lines):
${code.split("\n").slice(0, 50).join("\n")}`,
    1024
  );
}


function applyDiagnostics(editor: vscode.TextEditor, issues: any[]) {
  const diagnostics: vscode.Diagnostic[] = [];
  const document = editor.document;
  for (const issue of issues) {
    const lineIndex = Math.max(0, issue.line - 1);
    if (lineIndex >= document.lineCount) continue;
    const line = document.lineAt(lineIndex);
    const range = new vscode.Range(lineIndex, 0, lineIndex, line.text.length);
    const severity =
      issue.severity === "error" ? vscode.DiagnosticSeverity.Error :
      issue.severity === "warning" ? vscode.DiagnosticSeverity.Warning :
      vscode.DiagnosticSeverity.Information;
    const diagnostic = new vscode.Diagnostic(
      range, `[${issue.category.toUpperCase()}] ${issue.message}`, severity
    );
    diagnostic.source = "AI Code Reviewer";
    diagnostics.push(diagnostic);
  }
  diagnosticCollection.set(document.uri, diagnostics);
}

function showPanel(context: vscode.ExtensionContext, issues: any[], editor: vscode.TextEditor) {
  const history = getScoreHistory(context);
  const streak = calculateStreak(history);

  if (webviewPanel) {
    webviewPanel.reveal(vscode.ViewColumn.Two);
  } else {
    webviewPanel = vscode.window.createWebviewPanel(
      "aiCodeReviewer", "AI Code Reviewer",
      vscode.ViewColumn.Two,
      { enableScripts: true }
    );
    webviewPanel.onDidDispose(() => { webviewPanel = undefined; });

    webviewPanel.webview.onDidReceiveMessage(async message => {
      switch (message.command) {

        case "reviewAgain":
          await runReview(context, editor);
          break;

        case "autoFix":
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: "🔧 Fixing your code...", cancellable: false },
            async () => {
              try {
                const fixed = await getAutoFix(context, currentCode, currentLanguage, currentIssues);
                webviewPanel?.webview.postMessage({ command: "fixResult", content: fixed });
              } catch (e) { vscode.window.showErrorMessage(`Auto fix failed: ${e}`); }
            }
          );
          break;

        case "generateTests":
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: "🧪 Generating tests...", cancellable: false },
            async () => {
              try {
                const tests = await getUnitTests(context, currentCode, currentLanguage);
                webviewPanel?.webview.postMessage({ command: "testResult", content: tests });
              } catch (e) { vscode.window.showErrorMessage(`Test generation failed: ${e}`); }
            }
          );
          break;

        case "chat":
          try {
            const reply = await getChatResponse(context, currentCode, currentLanguage, message.message);
            webviewPanel?.webview.postMessage({ command: "chatResult", content: reply });
          } catch (e) {
            webviewPanel?.webview.postMessage({ command: "chatResult", content: "Sorry, something went wrong." });
          }
          break;

        case "learnConcept":
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `📚 Loading ${message.concept}...`, cancellable: false },
            async () => {
              try {
                const content = await getLearnContent(context, message.concept, currentLanguage);
                webviewPanel?.webview.postMessage({ command: "learnResult", content, concept: message.concept });
              } catch (e) { vscode.window.showErrorMessage(`Learn failed: ${e}`); }
            }
          );
          break;

        
        case "explainCode":
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: "🔍 Explaining your code...", cancellable: false },
            async () => {
              try {
                const explanation = await getCodeExplanation(context, currentCode, currentLanguage);
                webviewPanel?.webview.postMessage({ command: "explainResult", content: explanation });
              } catch (e) { vscode.window.showErrorMessage(`Explanation failed: ${e}`); }
            }
          );
          break;

        
        case "refactor":
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: "♻️ Generating refactor suggestions...", cancellable: false },
            async () => {
              try {
                const suggestions = await getRefactorSuggestions(context, currentCode, currentLanguage);
                webviewPanel?.webview.postMessage({ command: "refactorResult", content: suggestions });
              } catch (e) { vscode.window.showErrorMessage(`Refactor failed: ${e}`); }
            }
          );
          break;

        
        case "commitMessage":
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: "📝 Generating commit message...", cancellable: false },
            async () => {
              try {
                const commits = await getCommitMessage(context, currentCode, currentLanguage, currentIssues);
                webviewPanel?.webview.postMessage({ command: "commitResult", content: commits });
              } catch (e) { vscode.window.showErrorMessage(`Commit message failed: ${e}`); }
            }
          );
          break;

        case "toggleAutoReview":
          autoReviewEnabled = message.enabled;
          vscode.window.showInformationMessage(
            autoReviewEnabled ? "✅ Auto review enabled!" : "⏸️ Auto review paused."
          );
          break;

        case "clearHistory":
          context.globalState.update("scoreHistory", []);
          vscode.window.showInformationMessage("🗑️ Score history cleared!");
          break;
      }
    });
  }

  webviewPanel.webview.html = getWebviewContent(
    issues, currentCode, currentLanguage, autoReviewEnabled, history, streak
  );
}


async function runReview(context: vscode.ExtensionContext, editor: vscode.TextEditor) {
  currentCode = editor.document.getText();
  currentLanguage = detectLanguage(editor.document);

  if (!currentCode.trim()) {
    vscode.window.showErrorMessage("No code found!");
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `🔍 Reviewing ${currentLanguage} code...`, cancellable: false },
    async () => {
      try {
        currentIssues = await getAIReview(context, currentCode, currentLanguage);
        applyDiagnostics(editor, currentIssues);

        // Save to history
        const maxDeduction = 80;
        const bugs = currentIssues.filter((i: any) => i.category === "bug");
        const security = currentIssues.filter((i: any) => i.category === "security");
        const perf = currentIssues.filter((i: any) => i.category === "performance");
        const style = currentIssues.filter((i: any) => i.category === "style");
        const totalDeduction = Math.min(
          Math.min(bugs.length * 6, 30) +
          Math.min(security.length * 5, 25) +
          Math.min(perf.length * 3, 15) +
          Math.min(style.length * 1, 10),
          maxDeduction
        );
        const score = 100 - totalDeduction;
        saveScoreHistory(context, score, currentLanguage);

        showPanel(context, currentIssues, editor);

        vscode.window.showInformationMessage(
          `✅ ${currentLanguage} — Score: ${score}/100 — ${currentIssues.length} issues found`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`❌ Review failed: ${error}`);
      }
    }
  );
}



async function ensureInstallationId(context: vscode.ExtensionContext) {
  let installationId = context.globalState.get<string>("installationId");

  if (!installationId) {
    installationId = randomUUID();
    await context.globalState.update("installationId", installationId);
  }
}
async function updateProviderStatusBar(context: vscode.ExtensionContext) {
  const mode = context.globalState.get<string>("providerMode");

  if (!providerStatusBar) {
    providerStatusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    providerStatusBar.command = "aicodereviewer.changeProvider";
    providerStatusBar.tooltip = "AI Code Reviewer: Change Provider";
  }

  if (mode === "groq_own") {
    providerStatusBar.text = "$(zap) AI: Groq";
    providerStatusBar.show();
    return;
  }

  if (mode === "gemini_own") {
    providerStatusBar.text = "$(sparkle) AI: Gemini";
    providerStatusBar.show();
    return;
  }

  if (mode === "free_trial") {
    providerStatusBar.text = "$(gift) AI: Trial";
    providerStatusBar.show();
    return;
  }

  providerStatusBar.text = "$(question) AI: Setup";
  providerStatusBar.show();
}

async function showCurrentProvider(context: vscode.ExtensionContext) {
  const mode = context.globalState.get<string>("providerMode");

  if (mode === "groq_own") {
    vscode.window.showInformationMessage("Current provider: Groq");
    return;
  }

  if (mode === "gemini_own") {
    vscode.window.showInformationMessage("Current provider: Gemini");
    return;
  }

  if (mode === "free_trial") {
    vscode.window.showInformationMessage("Current provider: Free Trial");
    return;
  }

  vscode.window.showInformationMessage("No provider selected yet.");
}

async function clearSavedApiKeys(context: vscode.ExtensionContext) {
  await context.secrets.delete("groqApiKey");
  await context.secrets.delete("geminiApiKey");
  await context.globalState.update("providerMode", undefined);
  await context.globalState.update("onboarded", false);

  await updateProviderStatusBar(context);
  vscode.window.showInformationMessage("Saved API keys cleared.");
}
export async function activate(context: vscode.ExtensionContext) {
  console.log("AI Code Reviewer is active!");

  await ensureInstallationId(context);
  await updateProviderStatusBar(context);
  
  
  

  const reviewCommand = vscode.commands.registerCommand(
  "aicodereviewer.reviewCode",
  async () => {
    const ready = await ensureProviderConfigured(context);
    if (!ready) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No file open!");
      return;
    }

    await runReview(context, editor);
  }
);
const showCurrentProviderCommand = vscode.commands.registerCommand(
  "aicodereviewer.showCurrentProvider",
  async () => {
    const mode = context.globalState.get<string>("providerMode");

    if (mode === "groq_own") {
      vscode.window.showInformationMessage("Current provider: Groq");
      return;
    }

    if (mode === "gemini_own") {
      vscode.window.showInformationMessage("Current provider: Gemini");
      return;
    }

    if (mode === "free_trial") {
      vscode.window.showInformationMessage("Current provider: Free Trial");
      return;
    }

    vscode.window.showInformationMessage("No provider selected yet.");
  }
);

const changeProviderCommand = vscode.commands.registerCommand(
  "aicodereviewer.changeProvider",
  async () => {
    vscode.window.showInformationMessage("Opening provider selection...");

    const ready = await runSetupFlow(context);
    if (!ready) {
      vscode.window.showWarningMessage("Provider change cancelled.");
      return;
    }

    const mode = context.globalState.get("providerMode");
    vscode.window.showInformationMessage(`Provider changed. Current mode: ${mode}`);
  }
);
  async () => {
    const ready = await ensureProviderConfigured(context);
    if (!ready) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No file open!");
      return;
    }

    await runReview(context, editor);
  }
;

  const clearCommand = vscode.commands.registerCommand(
    "aicodereviewer.clearReview",
    () => {
      diagnosticCollection.clear();
      webviewPanel?.dispose();
      vscode.window.showInformationMessage("✅ Review cleared!");
    }
  );

  const onSave = vscode.workspace.onDidSaveTextDocument(async (document) => {
    if (!autoReviewEnabled) return;
    const codeExts = ["python","javascript","typescript","java","cpp","c","go","rust","php","ruby","swift","kotlin","csharp","dart"];
    if (!codeExts.includes(document.languageId)) return;
    if (reviewTimeout) clearTimeout(reviewTimeout);
    reviewTimeout = setTimeout(async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === document) {
        await runReview(context, editor);
      }
    }, 500);
  });

  const onOpen = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
    if (!editor || !autoReviewEnabled) return;
    const codeExts = ["python","javascript","typescript","java","cpp","c","go","rust","php","ruby","swift","kotlin","csharp","dart"];
    if (!codeExts.includes(editor.document.languageId)) return;
    if (!editor.document.getText().trim()) return;
    setTimeout(async () => { await runReview(context, editor); }, 1500);
  });

  context.subscriptions.push(
  reviewCommand,
  changeProviderCommand,
  clearCommand,
  diagnosticCollection
);
}

export function deactivate() {
  diagnosticCollection.clear();
  if (reviewTimeout) clearTimeout(reviewTimeout);
}