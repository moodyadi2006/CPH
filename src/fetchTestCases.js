const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { writeFile } = require("fs").promises;
const { tempDir } = require("./paths");

// Splits a LeetCode "Input:" string on top-level commas only, so commas
// inside brackets (e.g. "nums = [2,7,11,15]") or quoted strings don't
// get treated as argument separators.
function splitTopLevelArgs(str) {
  const parts = [];
  let depth = 0;
  let current = "";
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (inString) {
      current += ch;
      if (ch === stringChar && str[i - 1] !== "\\") {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      current += ch;
    } else if (ch === "[" || ch === "(" || ch === "{") {
      depth++;
      current += ch;
    } else if (ch === "]" || ch === ")" || ch === "}") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

// Parses "nums = [2,7,11,15], target = 9" into ordered {name, value} pairs.
function parseArgs(inputStr) {
  return splitTopLevelArgs(inputStr).map((part) => {
    const match = part.match(/^(\w+)\s*=\s*([\s\S]*)$/);
    if (match) {
      return { name: match[1], value: match[2].trim() };
    }
    return { name: null, value: part.trim() };
  });
}

// LeetCode's Input text writes arrays as [1,2,3]; C++ vector/array
// initializers need braces, so convert bracket syntax to brace syntax.
function toCppLiteral(value) {
  return value.replace(/\[/g, "{").replace(/\]/g, "}");
}

// LeetCode uses `null` for absent list/tree nodes; C++ has no nullable
// int, so INT_MIN is used as a sentinel understood by buildTree/buildList
// below. Tree/list node values in LeetCode problems are always small, so
// this never collides in practice (documented assumption, not a guarantee).
function toCppTreeLiteral(value) {
  return value.replace(/\bnull\b/g, "INT_MIN").replace(/\[/g, "{").replace(/\]/g, "}");
}

// Python has native None, so no sentinel is needed - just translate the token.
function toPyLiteral(value) {
  return value.replace(/\bnull\b/g, "None");
}

// Splits a C++ parameter list on top-level commas, treating <...> and
// (...) as nesting so "vector<vector<int>>& grid, int k" splits correctly.
function splitCppParams(paramStr) {
  const parts = [];
  let depth = 0;
  let current = "";

  for (const ch of paramStr) {
    if (ch === "<" || ch === "(") depth++;
    else if (ch === ">" || ch === ")") depth--;

    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  return parts;
}

// Parses one "vector<int>& nums" declaration into { type, name }, with
// the type stripped of & and const so it's usable to declare a fresh
// local (LeetCode always takes containers/strings by non-const
// reference, and a temporary literal can't bind to that - a named
// local can).
function parseParamDecl(param) {
  const match = param.trim().match(/^(.*[\s>*&])(\w+)$/);
  if (!match) return { type: null, name: null };

  const type = match[1]
    .trim()
    .replace(/&$/, "")
    .replace(/^const\s+/, "")
    .trim();

  return { type, name: match[2] };
}

// Local-variable declarations only make sense for value types we can
// build directly from the literal (primitives, string, vector<...>) or
// know how to deserialize (ListNode*, TreeNode*). Anything else (custom
// classes, random-pointer Node, N-ary Node) falls back to the old
// best-effort inline-literal call.
function isDeclarableCppType(type) {
  if (!type) return false;
  if (type.startsWith("vector<")) return true;
  if (type === "ListNode*" || type === "TreeNode*") return true;
  return [
    "int",
    "long",
    "long long",
    "short",
    "unsigned int",
    "size_t",
    "char",
    "float",
    "double",
    "bool",
    "string",
  ].includes(type);
}

function getCppParamList(paramsRaw) {
  if (!paramsRaw || !paramsRaw.trim()) return [];
  return splitCppParams(paramsRaw).map(parseParamDecl);
}

// Parses a Python parameter list like "nums: List[int], target: int" into
// ordered {name, type} pairs (type is null when there's no annotation).
// Reuses splitTopLevelArgs, which already treats [...] as nesting.
function parsePyParams(paramsRaw) {
  if (!paramsRaw || !paramsRaw.trim()) return [];
  return splitTopLevelArgs(paramsRaw)
    .filter((p) => p.trim() && p.trim() !== "self")
    .map((p) => {
      const match = p.match(/^(\w+)\s*:\s*(.+)$/);
      return match ? { name: match[1], type: match[2].trim() } : { name: p.trim(), type: null };
    });
}

function needsListNode(text) {
  return /ListNode/.test(text);
}
function needsTreeNode(text) {
  return /TreeNode/.test(text);
}

// Positional parser for a LeetCode C++ code snippet's method signature.
// Replaces a previous regex (\w+\s+\w+) that only matched bare
// single-word return types (int, string) - it silently failed to match
// "vector<int> twoSum(...)" or "ListNode* mergeTwoLists(...)" at all
// (\w excludes <, >, *), degrading every array/list/tree-returning
// problem to a broken best-effort fallback with no visible error.
function extractCppSignatureInfo(cppCode) {
  const publicIdx = cppCode.indexOf("public:");
  const searchFrom = publicIdx !== -1 ? publicIdx + "public:".length : 0;
  const openParenIdx = cppCode.indexOf("(", searchFrom);
  if (openParenIdx === -1) return null;

  const beforeParen = cppCode.slice(searchFrom, openParenIdx).trim();
  const nameMatch = beforeParen.match(/([A-Za-z_]\w*)$/);
  if (!nameMatch) return null;

  const funcName = nameMatch[1];
  const returnType = beforeParen.slice(0, nameMatch.index).trim();

  let depth = 0;
  let closeParenIdx = -1;
  for (let i = openParenIdx; i < cppCode.length; i++) {
    if (cppCode[i] === "(") depth++;
    else if (cppCode[i] === ")") {
      depth--;
      if (depth === 0) {
        closeParenIdx = i;
        break;
      }
    }
  }
  if (closeParenIdx === -1) return null;

  return {
    funcName,
    returnType,
    paramsRaw: cppCode.slice(openParenIdx + 1, closeParenIdx),
  };
}

// Same idea for Python, also capturing the return-type annotation
// (previously discarded entirely) since list/tree return values need it
// to know whether to serialize through serialize_list/serialize_tree.
function extractPySignatureInfo(pyCode) {
  const match = pyCode.match(/def\s+([A-Za-z_]\w*)\s*\((.*?)\)\s*(?:->\s*([^:]+))?:/);
  if (!match) return null;
  return {
    funcName: match[1],
    paramsRaw: match[2],
    returnType: match[3] ? match[3].trim() : null,
  };
}

function extractSignatureInfo(codeSnippets, preferredLanguage) {
  if (preferredLanguage === "C++") {
    const snippet = codeSnippets.find((s) => s.lang === "C++");
    return (snippet && extractCppSignatureInfo(snippet.code)) || { funcName: "solution", returnType: "auto", paramsRaw: "" };
  }
  if (preferredLanguage === "Python") {
    const snippet = codeSnippets.find((s) => s.lang === "Python" || s.lang === "Python3");
    return (snippet && extractPySignatureInfo(snippet.code)) || { funcName: "solution", returnType: null, paramsRaw: "" };
  }
  return null;
}

// Standard LeetCode node shapes, injected into the generated file only
// when the signature actually references them.
const CPP_LIST_TREE_DEFS = `struct ListNode {
    int val;
    ListNode *next;
    ListNode(int x) : val(x), next(NULL) {}
};
struct TreeNode {
    int val;
    TreeNode *left, *right;
    TreeNode(int x) : val(x), left(NULL), right(NULL) {}
};
ListNode* buildList(const vector<int>& vals) {
    ListNode dummy(0);
    ListNode* tail = &dummy;
    for (int v : vals) { tail->next = new ListNode(v); tail = tail->next; }
    return dummy.next;
}
string serializeList(ListNode* head) {
    string res = "[";
    for (ListNode* p = head; p; p = p->next) {
        if (p != head) res += ",";
        res += to_string(p->val);
    }
    return res + "]";
}
// LeetCode's tree arrays are a compact level-order encoding: a null
// node's children are never expanded into two more null slots, only
// non-null nodes consume the next two array slots for their children.
TreeNode* buildTree(const vector<int>& vals) {
    if (vals.empty() || vals[0] == INT_MIN) return nullptr;
    TreeNode* root = new TreeNode(vals[0]);
    queue<TreeNode*> q;
    q.push(root);
    size_t i = 1;
    while (!q.empty() && i < vals.size()) {
        TreeNode* node = q.front(); q.pop();
        if (i < vals.size()) {
            int lv = vals[i++];
            if (lv != INT_MIN) { node->left = new TreeNode(lv); q.push(node->left); }
        }
        if (i < vals.size()) {
            int rv = vals[i++];
            if (rv != INT_MIN) { node->right = new TreeNode(rv); q.push(node->right); }
        }
    }
    return root;
}
string serializeTree(TreeNode* root) {
    if (!root) return "[]";
    vector<string> result;
    queue<TreeNode*> q;
    q.push(root);
    while (!q.empty()) {
        TreeNode* node = q.front(); q.pop();
        if (!node) { result.push_back("null"); continue; }
        result.push_back(to_string(node->val));
        q.push(node->left);
        q.push(node->right);
    }
    // Trim trailing nulls (e.g. leaves' own null children) so the
    // output matches LeetCode's convention of stopping once real
    // structure ends, rather than padding to a complete-tree shape.
    while (!result.empty() && result.back() == "null") result.pop_back();
    string res = "[";
    for (size_t i = 0; i < result.size(); i++) {
        if (i) res += ",";
        res += result[i];
    }
    return res + "]";
}
`;

const PY_LIST_TREE_DEFS = `class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def build_list(vals):
    dummy = ListNode(0)
    tail = dummy
    for v in vals:
        tail.next = ListNode(v)
        tail = tail.next
    return dummy.next


def serialize_list(head):
    vals = []
    while head:
        vals.append(str(head.val))
        head = head.next
    return "[" + ",".join(vals) + "]"


def build_tree(vals):
    if not vals or vals[0] is None:
        return None
    root = TreeNode(vals[0])
    q = deque([root])
    i = 1
    while q and i < len(vals):
        node = q.popleft()
        if i < len(vals):
            lv = vals[i]
            i += 1
            if lv is not None:
                node.left = TreeNode(lv)
                q.append(node.left)
        if i < len(vals):
            rv = vals[i]
            i += 1
            if rv is not None:
                node.right = TreeNode(rv)
                q.append(node.right)
    return root


def serialize_tree(root):
    if not root:
        return "[]"
    result = []
    q = deque([root])
    while q:
        node = q.popleft()
        if node is None:
            result.append("null")
            continue
        result.append(str(node.val))
        q.append(node.left)
        q.append(node.right)
    while result and result[-1] == "null":
        result.pop()
    return "[" + ",".join(result) + "]"
`;

function buildCppSetupLine(type, localName, rawValue) {
  if (type === "ListNode*") {
    return `        ListNode* ${localName} = buildList(vector<int>${toCppLiteral(rawValue)});`;
  }
  if (type === "TreeNode*") {
    return `        TreeNode* ${localName} = buildTree(vector<int>${toCppTreeLiteral(rawValue)});`;
  }
  return `        ${type} ${localName} = ${toCppLiteral(rawValue)};`;
}

function wrapCppReturnExpr(returnType, callExpr) {
  if (returnType === "ListNode*") return `serializeList(${callExpr})`;
  if (returnType === "TreeNode*") return `serializeTree(${callExpr})`;
  return callExpr;
}

function buildPyCallArg(paramType, rawValue) {
  if (paramType && needsListNode(paramType)) return `build_list(${toPyLiteral(rawValue)})`;
  if (paramType && needsTreeNode(paramType)) return `build_tree(${toPyLiteral(rawValue)})`;
  return toPyLiteral(rawValue);
}

function wrapPyReturnExpr(returnType, callExpr) {
  if (returnType && needsListNode(returnType)) return `serialize_list(${callExpr})`;
  if (returnType && needsTreeNode(returnType)) return `serialize_tree(${callExpr})`;
  return callExpr;
}

// Extracts the body of `${funcName}(...) { ... }` (brace-matched, so
// nested braces in the user's code don't confuse it) from a previously
// generated solution.cpp, so regeneration (e.g. after a manually added
// test case) doesn't clobber in-progress solution code with a blank stub.
function extractCppSolutionBody(fileContent, funcName) {
  const funcIdx = fileContent.indexOf(`${funcName}(`);
  if (funcIdx === -1) return null;
  const openBraceIdx = fileContent.indexOf("{", funcIdx);
  if (openBraceIdx === -1) return null;

  let depth = 0;
  for (let i = openBraceIdx; i < fileContent.length; i++) {
    if (fileContent[i] === "{") depth++;
    else if (fileContent[i] === "}") {
      depth--;
      if (depth === 0) return fileContent.slice(openBraceIdx + 1, i);
    }
  }
  return null;
}

// Same idea for Python: extract the indented block under
// "def <funcName>(...):" using indentation depth instead of braces.
function extractPySolutionBody(fileContent, funcName) {
  const lines = fileContent.split("\n");
  const defIdx = lines.findIndex((line) => new RegExp(`def\\s+${funcName}\\s*\\(`).test(line));
  if (defIdx === -1) return null;

  const defIndent = (lines[defIdx].match(/^(\s*)/) || ["", ""])[1].length;
  const bodyLines = [];
  for (let i = defIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      bodyLines.push(line);
      continue;
    }
    const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (indent <= defIndent) break;
    bodyLines.push(line);
  }
  while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === "") bodyLines.pop();

  return bodyLines.length ? bodyLines.join("\n") : null;
}

function extractExistingSolutionBody(language, fileContent, funcName) {
  if (language === "C++") return extractCppSolutionBody(fileContent, funcName);
  if (language === "Python") return extractPySolutionBody(fileContent, funcName);
  return null;
}

// Function to generate a C++ template and save it
async function generateCppTemplate(signatureInfo, testCases, problemDir, existingBody) {
  const { funcName, returnType, paramsRaw } = signatureInfo;
  const paramDecls = getCppParamList(paramsRaw);
  const signatureText = `${returnType} ${funcName}(${paramsRaw})`;
  const needsHelpers = needsListNode(signatureText) || needsTreeNode(signatureText);

  const cleanedTestCases = testCases.map((testCase, index) => {
    const args = parseArgs(testCase.input);
    const canDeclareLocals =
      paramDecls.length === args.length &&
      paramDecls.every((p) => isDeclarableCppType(p.type));

    let setupLines = "";
    let callArgs;

    if (canDeclareLocals) {
      const localNames = paramDecls.map((p) => `${p.name}_${index}`);
      setupLines = paramDecls
        .map((p, i) => buildCppSetupLine(p.type, localNames[i], args[i].value))
        .join("\n");
      callArgs = localNames.join(", ");
    } else {
      callArgs = args.map((arg) => toCppLiteral(arg.value)).join(", ");
    }

    const callExpr = `solution.${funcName}(${callArgs})`;
    return { setupLines, printExpr: wrapCppReturnExpr(returnType, callExpr) };
  });

  const methodBody = existingBody != null ? existingBody : "\n        // Write your solution here\n    ";

  const templateContent = `#include <bits/stdc++.h>
using namespace std;

${needsHelpers ? CPP_LIST_TREE_DEFS + "\n" : ""}class Solution {
public:
    ${returnType} ${funcName}(${paramsRaw}) {${methodBody}}
};

// Prints results in LeetCode's [1,2,3] style so output can be diffed
// directly against the expected string, including nested vectors.
void printResult(bool val) { cout << (val ? "true" : "false"); }
template <typename T>
void printResult(const T& val) { cout << val; }
template <typename T>
void printResult(const vector<T>& val) {
    cout << "[";
    for (size_t i = 0; i < val.size(); i++) {
        if (i) cout << ",";
        printResult(val[i]);
    }
    cout << "]";
}

// Test cases
int main() {
    Solution solution;
    ${cleanedTestCases
      .map((testCase, index) => {
        return `    // Test case ${index + 1}
${testCase.setupLines}
        printResult(${testCase.printExpr}); cout << endl;`;
      })
      .join("\n")}
}
`;

  const filePath = path.join(problemDir, "solution.cpp");

  if (!fs.existsSync(problemDir)) {
    fs.mkdirSync(problemDir, { recursive: true });
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
async function generatePyTemplate(signatureInfo, testCases, problemDir, existingBody) {
  const { funcName, returnType, paramsRaw } = signatureInfo;
  const pyParams = parsePyParams(paramsRaw);
  const paramNames = pyParams.length
    ? pyParams.map((p) => p.name).join(", ")
    : testCases.length
    ? parseArgs(testCases[0].input)
        .map((arg, i) => arg.name || `arg${i + 1}`)
        .join(", ")
    : "";
  const signatureText = `${paramsRaw} ${returnType || ""}`;
  const needsHelpers = needsListNode(signatureText) || needsTreeNode(signatureText);

  const callLines = testCases
    .map((testCase, index) => {
      const args = parseArgs(testCase.input);
      const callArgs =
        pyParams.length === args.length
          ? args.map((arg, i) => buildPyCallArg(pyParams[i].type, arg.value)).join(", ")
          : args.map((arg) => toPyLiteral(arg.value)).join(", ");

      const callExpr = `solution.${funcName}(${callArgs})`;
      return `    # Test case ${index + 1}
    print(${wrapPyReturnExpr(returnType, callExpr)})`;
    })
    .join("\n");

  const methodBody = existingBody != null ? existingBody : "        # Write your solution here\n        pass";

  const templateContent = `${needsHelpers ? "from collections import deque\n\n\n" + PY_LIST_TREE_DEFS + "\n" : ""}class Solution:
    def ${funcName}(self${paramNames ? ", " + paramNames : ""}):
${methodBody}

# Test cases
if __name__ == "__main__":
    solution = Solution()
${callLines}
`;

  const filePath = path.join(problemDir, "solution.py");

  if (!fs.existsSync(problemDir)) {
    fs.mkdirSync(problemDir, { recursive: true });
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

// Regenerates a problem's solution file from an updated test case list
// (e.g. after a manually added test case), preserving whatever solution
// body already exists on disk instead of overwriting it with a blank stub.
async function regenerateTemplate(language, signatureInfo, testCases, problemDir) {
  const fileName = language === "C++" ? "solution.cpp" : "solution.py";
  const filePath = path.join(problemDir, fileName);
  let existingBody = null;
  if (fs.existsSync(filePath)) {
    const currentContent = fs.readFileSync(filePath, "utf-8");
    existingBody = extractExistingSolutionBody(language, currentContent, signatureInfo.funcName);
  }

  if (language === "C++") return generateCppTemplate(signatureInfo, testCases, problemDir, existingBody);
  if (language === "Python") return generatePyTemplate(signatureInfo, testCases, problemDir, existingBody);
  throw new Error("Unsupported language");
}

// This function fetches the test cases for a given LeetCode problem URL
async function fetchTestCases(problemUrl, preferredLanguage) {
  try {
    // Extract the problem slug from the URL (e.g., "two-sum" from "https://leetcode.com/problems/two-sum/")
    const problemSlug = problemUrl.split("/").filter(Boolean).pop();
    // Each problem gets its own folder so fetching a new problem never
    // clobbers a solution/test cases you already have for another one.
    const problemDir = path.join(tempDir, problemSlug);

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

    const content = response.data.data.question.content;
    const codeSnippets = response.data.data.question.codeSnippets;
    const signatureInfo = extractSignatureInfo(codeSnippets, preferredLanguage);

    if (!signatureInfo) {
      console.log("Unsupported language");
      return [];
    }

    const testCases = extractTestCasesFromContent(content, signatureInfo.funcName);

    if (testCases.length === 0) {
      console.log("No test cases found.");
      return [];
    }

    if (!fs.existsSync(problemDir)) {
      fs.mkdirSync(problemDir, { recursive: true });
    }
    // Persist the raw test cases alongside the solution so they survive
    // across fetches of other problems.
    await writeFile(path.join(problemDir, "testcases.json"), JSON.stringify(testCases, null, 2), "utf-8");

    if (preferredLanguage === "C++") {
      const result = await generateCppTemplate(signatureInfo, testCases, problemDir);
      return { ...result, language: preferredLanguage, signatureInfo, problemDir };
    } else if (preferredLanguage === "Python") {
      const result = await generatePyTemplate(signatureInfo, testCases, problemDir);
      return { ...result, language: preferredLanguage, signatureInfo, problemDir };
    }
    console.log("Unsupported language");
    return [];
  } catch (error) {
    console.error("Error fetching test cases:", error);
    return [];
  }
}

// Function to extract test cases from content
function extractTestCasesFromContent(content, funcName) {
  const inputOutputRegex =
    /<pre>\s*<strong>Input:<\/strong>\s*(.*?)\s*<strong>Output:<\/strong>\s*([\s\S]*?)(?=<strong>Explanation:<\/strong>|<\/pre>)/gs;

  const matches = [...content.matchAll(inputOutputRegex)];
  return matches.map((match) => ({
    funcName,
    input: match[1].trim().replace(/&quot;/g, '"'),
    output: match[2].trim().replace(/&quot;/g, '"'),
  }));
}

module.exports = {
  fetchTestCases,
  regenerateTemplate,
  extractExistingSolutionBody,
};
