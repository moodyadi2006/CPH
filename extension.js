const runTestCases = require("./src/runTestCases");
const { fetchTestCases } = require("./src/fetchTestCases");
const vscode = require("vscode");

// This method is called when your extension is activated
function activate(context) {
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
      panel.webview.html = new TestCasesViewProvider(
        context.extensionUri
      ).getWebviewContent();

      // Declare a variable outside to hold the filePath
      let fetchedFilePath; 
      
      // Listen for messages from the webview
      panel.webview.onDidReceiveMessage(async (message) => {
        const language = message.language;
        if (message.command === "fetchTestCases") {
          try {
            // Fetch test cases based on the URL
            const { filePath, testCases } = await fetchTestCases(
              message.url,
              language
            ); // Directly await the promise

            // Post the test cases to the webview
            panel.webview.postMessage({
              command: "displayTestCases",
              testCases: testCases,
            });

            fetchedFilePath = filePath;
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
            // Run the test cases using the fetchedFilePath
            const resultsOutput = await runTestCases(
              fetchedFilePath,
              testCases
            );

            // Post the results to the webview
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

  const testCasesProvider = new TestCasesTreeDataProvider();

  context.subscriptions.push(
    vscode.window.createTreeView("testCasesExplorer", {
      treeDataProvider: testCasesProvider,
    })
  );
}

// Tree Data Provider to display test cases in the Explorer panel
class TestCasesTreeDataProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.testCases = []; // Placeholder for your test cases data
  }
  // Get the root of the tree
  getTreeItem(element) {
    return element;
  }

  // Get the children (test cases) for the root item
  getChildren(element) {
    if (!element) {
      // Return the root node which can be a "Test Cases" label or any other relevant title
      return [
        new vscode.TreeItem(
          "Test Cases",
          vscode.TreeItemCollapsibleState.Collapsed
        ),
      ];
    }

    // Return test cases as tree items here
    return this.testCases.map((testCase) => {
      const treeItem = new vscode.TreeItem(
        testCase.name,
        vscode.TreeItemCollapsibleState.None
      );
      treeItem.command = {
        command: "competitive-programming-helper.runTestCases",
        title: "Run Test Case",
        arguments: [testCase],
      };
      return treeItem;
    });
  }

  // Optionally, you can define when the tree view should be refreshed
  refresh() {
    this._onDidChangeTreeData.fire();
  }

  // Set test cases data
  setTestCases(testCases) {
    this.testCases = testCases;
    this.refresh();
  }
}

// Webview View Provider class (Optional, if you still want the webview functionality)
class TestCasesViewProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
  }

  resolveWebviewView(webviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.getWebviewContent();
  }

  getWebviewContent() {
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

            .test-case, .results-container {
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

            h2, p {
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
                const div = document.createElement('div');
                div.className = 'test-case';

                const heading = document.createElement('h3');
                heading.textContent = 'Test Case ' + (index + 1);
                heading.style.color = '#333';

                const content = document.createElement('pre');
                content.textContent = JSON.stringify(testCase, null, 2);

                div.appendChild(heading);
                div.appendChild(content);
                container.appendChild(div);
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
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
