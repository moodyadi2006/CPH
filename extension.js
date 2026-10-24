const fs = require("fs");
const path = require("path");
const vscode = require("vscode");
const runTestCases = require("./src/runTestCases");
const { fetchTestCases, regenerateTemplate } = require("./src/fetchTestCases");
const { tempDir } = require("./src/paths");
const { SolutionCodeLensProvider, isGeneratedSolutionFile } = require("./src/codeLensProvider");
const { TestCasesTreeDataProvider } = require("./src/testCasesTreeDataProvider");

const outputChannel = vscode.window.createOutputChannel("Competitive Programming Helper");

function getExecutionTimeoutMs() {
  return vscode.workspace.getConfiguration("competitiveProgrammingHelper").get("executionTimeoutMs", 5000);
}

// Shared by the CodeLens "Run" button and the runTestCases Command
// Palette entry - reads the test cases persisted alongside the solution
// file at fetch time and reports pass/fail to a dedicated output channel.
async function runSolutionFile(filePath) {
  if (!isGeneratedSolutionFile(filePath)) {
    vscode.window.showErrorMessage("This isn't a generated CPH solution file. Fetch a problem via the CPH webview first.");
    return;
  }

  const dir = path.dirname(filePath);
  const testCasesPath = path.join(dir, "testcases.json");
  if (!fs.existsSync(testCasesPath)) {
    vscode.window.showErrorMessage("No testcases.json found next to this file. Fetch this problem via the CPH webview first.");
    return;
  }

  const testCases = JSON.parse(fs.readFileSync(testCasesPath, "utf-8"));
  const results = await runTestCases(filePath, testCases, { timeoutMs: getExecutionTimeoutMs() });

  outputChannel.clear();
  outputChannel.show(true);
  outputChannel.appendLine(`Running test cases for ${path.basename(dir)}...`);

  if (results && results.compileError) {
    outputChannel.appendLine(`Compile error:\n${results.compileError}`);
    return;
  }

  results.forEach((result) => {
    outputChannel.appendLine(`Test ${result.testCase}: ${result.status.toUpperCase()}`);
    if (result.status !== "passed") {
      outputChannel.appendLine(`  expected: ${result.expected}`);
      outputChannel.appendLine(`  actual:   ${result.actual}`);
      if (result.error) outputChannel.appendLine(`  ${result.error}`);
    }
  });
}

// This method is called when your extension is activated
function activate(context) {
  const testCasesProvider = new TestCasesTreeDataProvider(tempDir);

  // Register command to open the Webview panel
  const openWebviewCommand = vscode.commands.registerCommand(
    "competitive-programming-helper.openTestCasesWebview",
    () => {
      const panel = vscode.window.createWebviewPanel(
        "leetcodeTestCases",
        "LeetCode Test Cases",
        vscode.ViewColumn.One,
        { enableScripts: true, localResourceRoots: [context.extensionUri] }
      );
      panel.webview.html = getWebviewContent();

      // Tracks the most recently fetched problem so Run can regenerate
      // the solution's test harness (needed when a test case was added
      // manually since the fetch) and so the harness knows what
      // language/signature to regenerate against.
      let fetchedFilePath;
      let lastLanguage;
      let lastSignatureInfo;
      let lastProblemDir;

      // Listen for messages from the webview
      panel.webview.onDidReceiveMessage(async (message) => {
        const language = message.language;
        if (message.command === "fetchTestCases") {
          try {
            const result = await fetchTestCases(message.url, language);

            if (!result || !result.filePath) {
              panel.webview.postMessage({
                command: "showError",
                message: "Failed to fetch test cases.",
              });
              return;
            }

            panel.webview.postMessage({
              command: "displayTestCases",
              testCases: result.testCases,
            });

            fetchedFilePath = result.filePath;
            lastLanguage = result.language;
            lastSignatureInfo = result.signatureInfo;
            lastProblemDir = result.problemDir;

            const doc = await vscode.workspace.openTextDocument(fetchedFilePath);
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });

            testCasesProvider.refresh();
          } catch (error) {
            panel.webview.postMessage({
              command: "showError",
              message: "Failed to fetch test cases.",
            });
          }
        } else if (message.command === "runTestCases") {
          const testCases = message.testCases;
          // Early exit if filePath is not set
          if (!fetchedFilePath) {
            panel.webview.postMessage({
              command: "showError",
              message: "No file path available for running test cases.",
            });
            return;
          }

          try {
            // A manually added test case only exists in the webview's
            // in-memory list until the harness is regenerated - the
            // compiled binary otherwise only knows about whichever
            // cases existed when the file was last generated, and a new
            // case would always read past the end of its stdout.
            if (lastLanguage && lastSignatureInfo && lastProblemDir) {
              const regenResult = await regenerateTemplate(lastLanguage, lastSignatureInfo, testCases, lastProblemDir);
              if (regenResult && regenResult.filePath) {
                fetchedFilePath = regenResult.filePath;
              }
              fs.writeFileSync(
                path.join(lastProblemDir, "testcases.json"),
                JSON.stringify(testCases, null, 2),
                "utf-8"
              );
            }

            const resultsOutput = await runTestCases(fetchedFilePath, testCases, { timeoutMs: getExecutionTimeoutMs() });

            panel.webview.postMessage({
              command: "displayRunResults",
              results: resultsOutput,
            });
          } catch (error) {
            panel.webview.postMessage({
              command: "showError",
              message: "Failed to run test cases.",
            });
          }
        }
      });
    }
  );

  context.subscriptions.push(openWebviewCommand);

  context.subscriptions.push(
    vscode.window.createTreeView("testCasesExplorer", { treeDataProvider: testCasesProvider }),
    vscode.languages.registerCodeLensProvider(
      [{ language: "cpp" }, { language: "python" }],
      new SolutionCodeLensProvider()
    ),
    vscode.commands.registerCommand("competitive-programming-helper.runFromCodeLens", (filePath) =>
      runSolutionFile(filePath)
    ),
    vscode.commands.registerCommand("competitive-programming-helper.runTestCases", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("Open a generated CPH solution file first.");
        return;
      }
      return runSolutionFile(editor.document.fileName);
    })
  );
}

function getWebviewContent() {
  return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LeetCode Test Cases</title>
    <style>
        :root {
            --primary-color: #3498db;
            --secondary-color: #2ecc71;
            --error-color: #e74c3c;
            --background-color: #f8f9fa;
            --border-radius: 8px;
            --box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: var(--background-color);
            color: #2c3e50;
        }

        h2 {
            color: #2c3e50;
            margin-bottom: 1.5rem;
            font-size: 2rem;
            font-weight: 600;
        }

        h3 {
            font-size: 1.1rem;
        }

        p {
            color: #555;
            margin-bottom: 1.5rem;
        }

        input[type="text"] {
            width: 100%;
            max-width: 600px;
            padding: 12px 16px;
            margin-bottom: 1rem;
            border: 2px solid #e1e1e1;
            border-radius: var(--border-radius);
            font-size: 1rem;
            transition: border-color 0.3s ease;
        }

        input[type="text"]:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
        }

        button {
            padding: 12px 24px;
            margin-right: 10px;
            margin-bottom: 1rem;
            border: none;
            border-radius: var(--border-radius);
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        #fetchButton {
            background-color: var(--primary-color);
            color: white;
        }

        #runButton {
            background-color: var(--secondary-color);
            color: white;
        }

        #addTestCaseButton {
            background-color: #8e44ad;
            color: white;
        }

        button:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }

        button:disabled {
            background-color: #ccc;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }

        .manual-add {
            background: white;
            padding: 1.5rem;
            margin-top: 1rem;
            border-radius: var(--border-radius);
            box-shadow: var(--box-shadow);
        }

        .test-cases {
            margin-top: 2rem;
        }

        .test-case {
            background: white;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            border-radius: var(--border-radius);
            box-shadow: var(--box-shadow);
        }

        .test-case h3 {
            margin-top: 0;
            color: var(--primary-color);
            font-size: 1.25rem;
            font-weight: 600;
        }

        .test-case pre {
            background: #f7f9fc;
            padding: 1rem;
            border-radius: 6px;
            overflow-x: auto;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 0.9rem;
            line-height: 1.5;
            border: 1px solid #edf2f7;
        }

        .results-container {
            background: white;
            padding: 1.5rem;
            margin-top: 2rem;
            border-radius: var(--border-radius);
            box-shadow: var(--box-shadow);
        }

        .results-container h3 {
            margin-top: 0;
            color: var(--primary-color);
            font-size: 1.25rem;
            font-weight: 600;
        }

        .results-container pre {
            background: #f7f9fc;
            padding: 1rem;
            border-radius: 6px;
            overflow-x: auto;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 0.9rem;
            line-height: 1.5;
            border: 1px solid #edf2f7;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
            body {
                padding: 15px;
            }

            button {
                width: 100%;
                margin-right: 0;
            }

            input[type="text"] {
                max-width: 100%;
            }
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
            body {
                background-color: #1a1a1a;
                color: #f0f0f0;
            }

            .test-case, .results-container, .manual-add {
                background: #2d2d2d;
            }

            .test-case pre, .results-container pre {
                background: #363636;
                border-color: #404040;
                color: #f0f0f0;
            }

            input[type="text"] {
                background-color: #2d2d2d;
                border-color: #404040;
                color: #f0f0f0;
            }

            h2, h3, p {
                color: #f0f0f0;
            }
        }
    </style>
</head>

<body>
    <h2>LeetCode Test Cases</h2>
    <p>Paste the LeetCode problem URL to fetch test cases.</p>
    <input type="text" id="urlInput" placeholder="https://leetcode.com/problems/example">
    <div>
     <label>
    <input type="radio" name="language" value="C++" checked>
    C++
  </label>
  <label>
    <input type="radio" name="language" value="Python">
    Python
  </label>
    </div>
    <button id="fetchButton">Fetch Test Cases</button>
    <button id="runButton" disabled>Run Test Cases</button>

    <div class="manual-add">
        <h3>Add a test case manually</h3>
        <input type="text" id="manualInput" placeholder="Input (e.g. nums = [1,2,3], target = 5)">
        <input type="text" id="manualOutput" placeholder="Expected Output (e.g. [0,1])">
        <button id="addTestCaseButton">Add Test Case</button>
    </div>

    <div class="test-cases" id="testCasesContainer"></div>
    <div class="results-container" id="resultsContainer"></div>

    <script>
        const vscode = acquireVsCodeApi();
        let fetchedTestCases = null; // To store fetched test cases

        // Fetch Test Cases
        document.getElementById('fetchButton').addEventListener('click', () => {
  const url = document.getElementById('urlInput').value;

  // Get the selected language from the radio buttons
  const selectedLanguage = document.querySelector('input[name="language"]:checked').value;

  if (url) {
    vscode.postMessage({
      command: 'fetchTestCases',
      url: url,
      language: selectedLanguage // Send the selected language (either 'cpp' or 'python')
    });
  } else {
    vscode.postMessage({ command: 'showError', message: 'Please provide a valid URL!' });
  }
});

        function renderTestCase(container, index, testCase) {
            const div = document.createElement('div');
            div.className = 'test-case';

            const heading = document.createElement('h3');
            heading.textContent = 'Test Case ' + index;

            const content = document.createElement('pre');
            content.textContent = JSON.stringify(testCase, null, 2);

            div.appendChild(heading);
            div.appendChild(content);
            container.appendChild(div);
        }

        // Add a test case manually, without needing a fresh fetch
        document.getElementById('addTestCaseButton').addEventListener('click', () => {
            const input = document.getElementById('manualInput').value.trim();
            const output = document.getElementById('manualOutput').value.trim();
            if (!input || !output) {
                alert('Please provide both input and output.');
                return;
            }

            if (!fetchedTestCases) fetchedTestCases = [];
            const funcName = fetchedTestCases.length ? fetchedTestCases[0].funcName : null;
            const newCase = { funcName, input, output };
            fetchedTestCases.push(newCase);

            renderTestCase(document.getElementById('testCasesContainer'), fetchedTestCases.length, newCase);

            document.getElementById('manualInput').value = '';
            document.getElementById('manualOutput').value = '';
            document.getElementById('runButton').disabled = false;
        });

        // Run Test Cases button click
        document.getElementById('runButton').addEventListener('click', () => {
            if (fetchedTestCases && fetchedTestCases.length > 0) {
                console.log('Running test cases...');
                vscode.postMessage({
                    command: 'runTestCases',
                    testCases: fetchedTestCases // Directly pass the test cases
                });
            } else {
                alert('No test cases to run. Please fetch test cases first.');
            }
        });

        // Listen for messages from the extension
        window.addEventListener('message', (event) => {
    const message = event.data;
    console.log("Received message:", message);

    if (message.command === 'displayTestCases') {
        // Correctly access the test cases array
        const testCasesResult = message.testCases || [];
        fetchedTestCases = testCasesResult;
        const container = document.getElementById('testCasesContainer');
        container.innerHTML = '';

        if (testCasesResult && testCasesResult.length > 0) {
            testCasesResult.forEach((testCase, index) => {
                renderTestCase(container, index + 1, testCase);
            });
            document.getElementById('runButton').disabled = false;
        } else {
            container.innerHTML = '<p>No test cases found.</p>';
            document.getElementById('runButton').disabled = true;
        }
    } else if (message.command === 'showError') {
        alert(message.message);
    } else if (message.command === 'displayRunResults') {
        const results = message.results;
        console.log('Test case results:', results);
        const resultsContainer = document.getElementById('resultsContainer');
        resultsContainer.innerHTML = '<h3>Test Case Results</h3><pre>' + JSON.stringify(results, null, 2) + '</pre>';
        resultsContainer.style.display = 'block';
    }
});
    </script>
</body>
</html>
`;
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
