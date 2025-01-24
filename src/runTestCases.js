const fs = require("fs");
const path = require("path");
const { exec } = require("child_process"); // For running shell commands
const tempDir = path.join(__dirname, "temp"); // Directory to save the temporary file

// Function to run test cases on the template file
async function runTestCases(filePath, testCases) {
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
      await compileAndExecuteCpp(filePath, testCases, resultsOutput);
      return resultsOutput;
    } else if (extname === ".py") {
      await compileAndExecutePython(filePath, testCases, resultsOutput);
      return resultsOutput;
    } else {
      throw new Error("Unsupported file extension.");
    }
  } catch (error) {
    console.error(`Test case failed: ${error.message}`);
  }
}

// Function to compile and execute C++ code
async function compileAndExecuteCpp(filePath, testCases, resultsOutput) {
  return new Promise((resolve, reject) => {
    // Compile the C++ code
    console.log("Compiling C++ code...");

    // Fixed compilation command syntax
    exec(
      `g++ -std=c++11 ${filePath} -o ${path.join(tempDir, "test_case")}`,
      async (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`C++ Compilation failed: ${stderr}`));
          return;
        }

        try {
          // Store results of each test case
          let results = [];

          // Create an array of promises for each test case execution
          const testPromises = testCases.map((testCase, index) => {
            return new Promise((resolveTest) => {
              exec(
                `${path.join(tempDir, "test_case")}`,
                (err, stdout, stderr) => {
                  const outputLines = stdout.trim().split("\n");
                  const outputLine = outputLines[index];

                  const testResult = {
                    testCase: index + 1,
                    passed: false,
                    expected: testCase.output.trim(),
                    actual: outputLine ? outputLine.trim() : null,
                    error: null,
                  };

                  if (err) {
                    testResult.error = `Execution failed: ${stderr}`;
                    results.push(testResult);
                    resolveTest(); // Resolve even in case of errors to allow processing of all test cases
                  } else if (
                    outputLine &&
                    outputLine.trim() === testCase.output.trim()
                  ) {
                    testResult.passed = true;
                    results.push(testResult);
                    resolveTest();
                  } else {
                    testResult.error = `Test case failed. Expected: ${testResult.expected}, Got: ${testResult.actual}`;
                    results.push(testResult);
                    resolveTest();
                  }
                }
              );
            });
          });

          // Wait for all test cases to finish
          await Promise.all(testPromises);

          console.log(results); // This will now correctly show the populated results array
          resultsOutput.length = 0; // Clear the array
          resultsOutput.push(...results); // Push the new results

          console.log(resultsOutput);

          resolve();
        } catch (error) {
          console.error("Error during test execution:", error);
        }
      }
    );
  });
}
// Function to compile and execute Python code
async function compileAndExecutePython(filePath, testCases, resultsOutput) {
  return new Promise((resolve, reject) => {
    // Compile the Python code (Python doesn't need explicit compilation, so we just check for errors)
    console.log("Compiling Python code...");

    try {
      // Store results of each test case
      let results = [];

      // Create an array of promises for each test case execution
      const testPromises = testCases.map((testCase, index) => {
        return new Promise((resolveTest) => {
          exec(
            `python ${filePath}`,
            async (err, stdout, stderr) => { // Mark the callback as async
              const outputLines = stdout.trim().split("\n");
              const outputLine = outputLines[index];

              const testResult = {
                testCase: index + 1,
                passed: false,
                expected: testCase.output.trim(),
                actual: outputLine ? outputLine.trim() : null,
                error: null,
              };

              if (err) {
                testResult.error = `Execution failed: ${stderr}`;
                results.push(testResult);
                resolveTest(); // Resolve even in case of errors to allow processing of all test cases
              } else if (
                outputLine &&
                outputLine.trim() === testCase.output.trim()
              ) {
                testResult.passed = true;
                results.push(testResult);
                resolveTest();
              } else {
                testResult.error = `Test case failed. Expected: ${testResult.expected}, Got: ${testResult.actual}`;
                results.push(testResult);
                resolveTest();
              }
            }
          );
        });
      });

      // Wait for all test cases to finish
      Promise.all(testPromises)
        .then(() => {
          console.log(results); // This will now correctly show the populated results array
          resultsOutput.length = 0; // Clear the array
          resultsOutput.push(...results); // Push the new results

          resolve();
        })
        .catch((error) => {
          console.error("Error during test execution:", error);
          reject(error);
        });

    } catch (error) {
      console.error("Error during test execution:", error);
      reject(error);
    }
  });
}



module.exports = runTestCases;
