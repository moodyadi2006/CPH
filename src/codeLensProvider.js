const path = require("path");
const vscode = require("vscode");
const { tempDir } = require("./paths");

// A generated solution lives at <tempDir>/<problem-slug>/solution.{cpp,py} -
// checking that shape (rather than e.g. just the filename) keeps the lens
// from showing up on unrelated cpp/python files the user happens to open.
function isGeneratedSolutionFile(fileName) {
  const base = path.basename(fileName);
  if (base !== "solution.cpp" && base !== "solution.py") return false;
  return path.dirname(path.dirname(fileName)) === tempDir;
}

class SolutionCodeLensProvider {
  provideCodeLenses(document) {
    if (!isGeneratedSolutionFile(document.fileName)) return [];

    const text = document.getText();
    const match = text.match(/class\s+Solution\s*[:{]/);
    if (!match) return [];

    const position = document.positionAt(match.index);
    const range = new vscode.Range(position, position);

    return [
      new vscode.CodeLens(range, {
        title: "▶ Run Test Cases",
        command: "competitive-programming-helper.runFromCodeLens",
        arguments: [document.fileName],
      }),
    ];
  }
}

module.exports = { SolutionCodeLensProvider, isGeneratedSolutionFile };
