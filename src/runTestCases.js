const fs = require("fs");
const path = require("path");
const { exec } = require("child_process"); // For running shell commands
const tempDir = path.join(__dirname, "temp"); // Directory to save the temporary file

// Function to run test cases on the template file
async function runTestCases(filePath, testCases) {
  console.log(filePath, testCases);
  const extname = path.extname(filePath).toLowerCase(); // Get file extension

  try {
    // Create the temporary directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      await fs.promises.mkdir(tempDir);
    }

    // Determine the language based on the file extension
    if (extname === ".cpp") {
      // Compile and execute C++ code
      await compileAndExecuteCpp(filePath, testCases);
    } else if (extname === ".py") {
      // Execute Python code
     // await executePythonCode(filePath, testCases);
    } else {
      throw new Error("Unsupported file extension.");
    }
  } catch (error) {
    console.error(`Test case failed: ${error.message}`);
  }
}

// Function to compile and execute C++ code
async function compileAndExecuteCpp(filePath, testCases) {
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

        console.log("C++ code compiled successfully.");

        try {
          // Create a Promise for each test case execution
          for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];

            await new Promise((resolveTest, rejectTest) => {
              exec(
                `${path.join(tempDir, "test_case")}`,
                (err, stdout, stderr) => {
                  if (err) {
                    rejectTest(
                      new Error(
                        `Execution failed for test case ${i + 1}: ${stderr}`
                      )
                    );
                    return;
                  }

                  console.log(
                    `Execution Output for test case ${i + 1}: ${stdout.trim()}`
                  );

                  if (stdout.trim() === testCase.output.trim()) {
                    console.log(`Test case ${i + 1} passed!`);
                    resolveTest();
                  } else {
                    rejectTest(
                      new Error(
                        `Test case ${i + 1} failed. Expected: ${
                          testCase.expectedOutput
                        }, Got: ${stdout.trim()}`
                      )
                    );
                  }
                }
              );
            });
          }

          resolve("All test cases passed successfully!");
        } catch (error) {
          reject(error);
        }
      }
    );
  });

  // async function executePythonCode(filePath, testCases, tempDir) {
  //   return new Promise((resolve, reject) => {
  //     // Execute the Python code
  //     console.log("Executing Python code...");
      
  //     try {
  //       // Create a Promise for each test case execution
  //       for (let i = 0; i < testCases.length; i++) {
  //         const testCase = testCases[i];
  
  //         await new Promise((resolveTest, rejectTest) => {
  //           exec(
  //             `python3 ${filePath}`, 
  //             (err, stdout, stderr) => {
  //               if (err) {
  //                 rejectTest(new Error(`Execution failed for test case ${i + 1}: ${stderr}`));
  //                 return;
  //               }
  
  //               console.log(`Execution Output for test case ${i + 1}: ${stdout.trim()}`);
                
  //               if (stdout.trim() === testCase.expectedOutput.trim()) {
  //                 console.log(`Test case ${i + 1} passed!`);
  //                 resolveTest();
  //               } else {
  //                 rejectTest(
  //                   new Error(
  //                     `Test case ${i + 1} failed. Expected: ${testCase.expectedOutput}, Got: ${stdout.trim()}`
  //                   )
  //                 );
  //               }
  //             }
  //           );
  //         });
  //       }
  
  //       resolve("All test cases passed successfully!");
  //     } catch (error) {
  //       reject(error);
  //     }
  //   });
  // }
}


module.exports = runTestCases;
