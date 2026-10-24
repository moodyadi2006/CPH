const fs = require("fs");
const path = require("path");
const { exec } = require("child_process"); // For running shell commands
const { tempDir } = require("./paths");

const DEFAULT_TIMEOUT_MS = 5000;

// Function to run test cases on the template file
async function runTestCases(filePath, testCases, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const extname = path.extname(filePath).toLowerCase(); // Get file extension

  try {
    // Create the temporary directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      await fs.promises.mkdir(tempDir);
    }
    let resultsOutput = [];

    // Determine the language based on the file extension
    if (extname === ".cpp") {
      // Compile and execute C++ code
      await compileAndExecuteCpp(filePath, testCases, resultsOutput, timeoutMs);
      return resultsOutput;
    } else if (extname === ".py") {
      await compileAndExecutePython(filePath, testCases, resultsOutput, timeoutMs);
      return resultsOutput;
    } else {
      throw new Error("Unsupported file extension.");
    }
  } catch (error) {
    console.error(`Test case failed: ${error.message}`);
    // Surface the failure to the caller instead of silently swallowing
    // it - previously a compile error resolved to `undefined`, which the
    // webview would render as the literal text "undefined".
    return { compileError: error.message };
  }
}

// Builds the pass/fail result list from a single run's combined stdout.
function buildResults(testCases, stdout, execError, stderr, timedOut, timeoutMs) {
  const outputLines = stdout.trim().split("\n");

  return testCases.map((testCase, index) => {
    const outputLine = outputLines[index];
    const testResult = {
      testCase: index + 1,
      passed: false,
      status: "failed",
      expected: testCase.output.trim(),
      actual: outputLine ? outputLine.trim() : null,
      error: null,
    };

    if (timedOut) {
      testResult.status = "timeout";
      testResult.error = `Execution timed out after ${timeoutMs}ms.`;
    } else if (execError) {
      testResult.status = "error";
      testResult.error = `Execution failed: ${stderr}`;
    } else if (outputLine && outputLine.trim() === testCase.output.trim()) {
      testResult.passed = true;
      testResult.status = "passed";
    } else {
      testResult.error = `Test case failed. Expected: ${testResult.expected}, Got: ${testResult.actual}`;
    }

    return testResult;
  });
}

function isTimeout(execErr) {
  return !!(execErr && execErr.killed && execErr.signal === "SIGTERM");
}

// Function to compile and execute C++ code
async function compileAndExecuteCpp(filePath, testCases, resultsOutput, timeoutMs) {
  const outputDir = path.dirname(filePath);
  const binaryPath = path.join(outputDir, "solution");

  return new Promise((resolve, reject) => {
    console.log("Compiling C++ code...");

    exec(`g++ -std=c++11 "${filePath}" -o "${binaryPath}"`, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`C++ Compilation failed: ${stderr}`));
        return;
      }

      // Run the program once: main() already prints every test case's
      // output on its own line, so a single execution is enough to
      // score all of them.
      exec(`"${binaryPath}"`, { timeout: timeoutMs }, (execErr, runStdout, runStderr) => {
        const results = buildResults(testCases, runStdout, execErr, runStderr, isTimeout(execErr), timeoutMs);
        resultsOutput.length = 0;
        resultsOutput.push(...results);
        resolve();
      });
    });
  });
}

// Function to compile and execute Python code
async function compileAndExecutePython(filePath, testCases, resultsOutput, timeoutMs) {
  return new Promise((resolve) => {
    console.log("Running Python code...");

    // Same reasoning as the C++ path: one run, one line of output per
    // test case.
    exec(`python "${filePath}"`, { timeout: timeoutMs }, (execErr, stdout, stderr) => {
      const results = buildResults(testCases, stdout, execErr, stderr, isTimeout(execErr), timeoutMs);
      resultsOutput.length = 0;
      resultsOutput.push(...results);
      resolve();
    });
  });
}

module.exports = runTestCases;
