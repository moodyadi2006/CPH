# Competitive Programming Helper (CPH)

Fetch a LeetCode problem's sample test cases and run them against your solution — without leaving VS Code.

Paste a problem URL, get a ready-to-fill C++ or Python solution file with the test cases already wired up, write your solution, and run it right from the editor.

## Features

- **Fetch test cases directly from a LeetCode URL** — no browser extension required. Pulls the problem's function signature and sample inputs/outputs straight from LeetCode.
- **Auto-generated solution templates** for **C++** and **Python**, matching LeetCode's own `class Solution` format.
- **LinkedList and Binary Tree support** — `ListNode`/`TreeNode` arguments and return values are automatically built from and serialized back to LeetCode's array notation (e.g. `[1,2,3,4,5]`, `[3,9,20,null,null,15,7]`), so list/tree problems work out of the box.
- **Run from the editor** — a "▶ Run Test Cases" button (CodeLens) appears right above your `class Solution`, or run from the webview panel.
- **Manual test cases** — add your own input/output pairs alongside the fetched ones, directly in the webview.
- **Recently fetched problems** — a sidebar view (Explorer → "Test Cases Explorer") lists problems you've fetched, one click to reopen.
- Each problem gets its own folder, so fetching a new one never overwrites a solution you're still working on.

## Requirements

- **C++ solutions** require `g++` on your `PATH` (e.g. via [MSYS2](https://www.msys2.org/) on Windows, or Xcode Command Line Tools / build-essential elsewhere).
- **Python solutions** require `python` on your `PATH`.

## How to use

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **CPH: Open LeetCode Test Cases Webview**.
2. Paste a LeetCode problem URL (e.g. `https://leetcode.com/problems/two-sum/`), pick C++ or Python, and click **Fetch Test Cases**.
3. The generated solution file opens automatically. Write your solution in the `class Solution` body.
4. Click the **▶ Run Test Cases** CodeLens above `class Solution` (or the webview's **Run Test Cases** button) to see pass/fail results.
5. Optionally add your own test cases via the webview's "Add a test case manually" box before running.

## Extension Settings

This extension contributes the following setting:

- `competitiveProgrammingHelper.executionTimeoutMs`: Maximum time (in milliseconds) a compiled/interpreted solution may run before being killed as timed out. Default: `5000`.

## Known Issues

- `Node*` (random-pointer list) and N-ary `Node` problems aren't deserialized automatically — these fall back to a best-effort call that likely won't compile.
- Only C++ and Python are supported.
- Fetched problems are stored under the extension's own install directory, so a Marketplace update to a new version clears your previously fetched problem history (your own solution code is unaffected unless you moved it elsewhere).

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for full release notes.

### 0.1.0

Correctness fixes to test case parsing and C++ code generation, added LinkedList/TreeNode support, a "Run Test Cases" CodeLens, an execution timeout setting, manual test case entry, and a working "recently fetched problems" sidebar.

---

**Enjoy!**
