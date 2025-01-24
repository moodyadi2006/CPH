const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { writeFile } = require("fs").promises;
const tempDir = path.join(__dirname, "temp");

let filePath;

// Function to generate a C++ template and save it
async function generateCppTemplate(functionSignature, testCases) {
  const cleanedTestCases = testCases.map((testCase) => {
    const cleanedFuncName = testCase.funcName
      .replace(/^(int|string|float|object|double)\s*/, "")
      .trim();

    return { ...testCase, funcName: cleanedFuncName };
  });

  const templateContent = `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    ${functionSignature} {
        // Write your solution here
    }
};

// Test cases
int main() {
    Solution solution;
    ${cleanedTestCases
      .map((testCase, index) => {
        const parts = testCase.input.split(", ");
        const inputParts = parts.filter(
          (part) => part.includes("=") && !part.startsWith("val")
        );
        const inputStr = inputParts
          .map((part) => part.split("= ")[1])
          .join(", ");
        const valPart =
          parts.find((part) => part.startsWith("val"))?.split("= ")[1] || "";

        return `    // Test case ${index + 1}
        cout << solution.${testCase.funcName}(${inputStr}${
          valPart ? ", " + valPart : ""
        }) << endl;`;
      })
      .join("\n")}
}
`;

  const fileName = `solution_template.cpp`; // C++ template file name
  filePath = path.join(tempDir, fileName);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  try {
    await writeFile(filePath, templateContent, "utf-8");
    console.log(`C++ template file saved to: ${filePath}`);
    return { filePath, testCases };
  } catch (error) {
    console.error("Failed to save template file:", error);
    return { success: false, error: "Failed to save template file!" };
  }
}

// Function to generate a Python template and save it
async function generatePyTemplate(functionSignature, testCases) {
  const cleanedTestCases = testCases.map((testCase) => {
    const cleanedFuncName = testCase.funcName
      .replace(/^(int|string|float|bool|object|double)\s*/, "") // Removes type declaration
      .trim();

    const cleanedInputForVar = testCase.input
      .split(", ")
      .map((input) => input.split(" =")[0]) // Extract only the value after "="
      .join(", ");
    // Modify the function signature to include `self` as the first argument
    const cleanedFunctionSignature = `def ${cleanedFuncName}(self, ${cleanedInputForVar})`;

    const cleanedInput = testCase.input
      .split(", ")
      .map((input) => input.split("= ")[1]) // Extract only the value after "="
      .join(", ");

    return {
      ...testCase,
      funcName: cleanedFuncName,
      input: cleanedInput,
      functionSignature: cleanedFunctionSignature,
    };
  });

  const templateContent = `class Solution:
    ${
      cleanedTestCases[0].functionSignature
    }:  # Assuming single test case for signature
        # Write your solution here
        pass

# Test cases
if __name__ == "__main__":
    solution = Solution()
    ${cleanedTestCases
      .map((testCase, index) => {
        return `    # Test case ${index + 1}
    print(solution.${testCase.funcName}(${testCase.input}))`;
      })
      .join("\n")}
`;

  const fileName = `solution_template.py`; // Python template file name
  filePath = path.join(tempDir, fileName);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  try {
    await writeFile(filePath, templateContent, "utf-8");
    console.log(`Python template file saved to: ${filePath}`);
    return { filePath, testCases };
  } catch (error) {
    console.error("Failed to save template file:", error);
    return { success: false, error: "Failed to save template file!" };
  }
}

// This function fetches the test cases for a given LeetCode problem URL
async function fetchTestCases(problemUrl, preferredLanguage) {
  try {
    // Extract the problem slug from the URL (e.g., "two-sum" from "https://leetcode.com/problems/two-sum/")
    const problemSlug = problemUrl.split("/").filter(Boolean).pop();

    // GraphQL query
    const query = `
        query getProblemDetails($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
                title
                content
                codeSnippets {
                    lang
                    code
                }
            }
        }`;

    // API endpoint
    const endpoint = "https://leetcode.com/graphql/";

    const response = await axios.post(
      endpoint,
      {
        query,
        variables: { titleSlug: problemSlug },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // Extract content and parse test cases
    const content = response.data.data.question.content;
    const testCases = extractTestCasesFromContent(content);

    if (testCases.length > 0) {
      // Extract the function signature
      const functionSignature = extractFunctionSignature(
        response.data.data.question.codeSnippets
      );
      const funcName = functionSignature.split("(")[0]; // Extract function name from signature
      const testCases = extractTestCasesFromContent(content, funcName);
      console.log(testCases);

      // Generate the corresponding template based on preferred language
      if (preferredLanguage === "C++") {
        return await generateCppTemplate(functionSignature, testCases);
      } else if (preferredLanguage === "Python") {
        return await generatePyTemplate(functionSignature, testCases);
      } else {
        console.log("Unsupported language");
      }
    } else {
      console.log("No test cases found.");
      return [];
    }
  } catch (error) {
    console.error("Error fetching test cases:", error);
    return [];
  }
}

// Extract function signature from code snippets
function extractFunctionSignature(codeSnippets) {
  const cppSnippet = codeSnippets.find((snippet) => snippet.lang === "C++");
  const pySnippet = codeSnippets.find((snippet) => snippet.lang === "Python");

  // Assuming that the first snippet contains the function signature
  if (cppSnippet) {
    const match = cppSnippet.code.match(/(\w+\s+\w+)\s*\((.*?)\)/);
    if (match) {
      return match[1] + "(" + match[2] + ")";
    }
  } else if (pySnippet) {
    const match = pySnippet.code.match(/def (\w+)\((.*?)\)/);
    if (match) {
      return match[1] + "(" + match[2] + ")";
    }
  }
  return "functionName"; // Default
}

// Function to extract test cases from content
function extractTestCasesFromContent(content, funcName) {
  const inputOutputRegex =
    /<pre>\s*<strong>Input:<\/strong>\s*(.*?)\s*<strong>Output:<\/strong>\s*([\s\S]*?)(?=<strong>Explanation:<\/strong>|<\/pre>)/gs;

  const matches = [...content.matchAll(inputOutputRegex)];
  return matches.map((match, index) => ({
    funcName,
    input: match[1].trim().replace(/&quot;/g, '"'),
    output: match[2].trim().replace(/&quot;/g, '"'),
  }));
}

module.exports = {
  fetchTestCases
};
