# Change Log

All notable changes to the "competitive-programming-helper" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.1]

- Added an MIT license.
- Updated `axios` (and its `follow-redirects`/`form-data` dependencies) to fix several security advisories.
- README: added a screenshot and instructions for running the extension from source.

## [0.1.0]

- Fixed test case argument parsing to correctly handle array/nested inputs (e.g. `nums = [2,7,11,15], target = 9`) instead of naively splitting on every comma.
- Fixed C++ generation so array/string arguments actually compile: converted LeetCode's `[...]` array syntax to C++ `{...}` brace-init syntax, and switched to named local variables so values can bind to LeetCode's non-const-reference parameters.
- Added a generic result printer so return types like `vector<int>` print in LeetCode's `[1,2,3]` format instead of failing to compile.
- Added real LinkedList/TreeNode support: solutions can now build and print `ListNode`/`TreeNode` structures from/to LeetCode's array notation, in both C++ and Python.
- Each fetched problem now gets its own folder instead of sharing one temp file, so fetching a new problem no longer overwrites your previous one.
- Fixed the C++/Python runner to execute the compiled solution once instead of re-running it once per test case.
- Added a "Run Test Cases" CodeLens above the solution so you can run directly from the editor, not just the webview.
- Added an execution timeout (configurable via `competitiveProgrammingHelper.executionTimeoutMs`) so an infinite loop can't hang the extension.
- Added a manual "add test case" option in the webview.
- Replaced the non-functional sidebar view with a working "recently fetched problems" list.
- Fixed the missing activity bar icon.

## [Unreleased]

- Initial release