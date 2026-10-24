const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

// Lists previously-fetched problems (one folder per slug under tempDir) so
// they can be reopened without re-fetching. Replaces the old placeholder
// provider whose backing data was never populated by anything.
class TestCasesTreeDataProvider {
  constructor(tempDir) {
    this.tempDir = tempDir;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (element) return [];
    if (!fs.existsSync(this.tempDir)) return [];

    return fs
      .readdirSync(this.tempDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .map((slug) => {
        const dir = path.join(this.tempDir, slug);
        const target = ["solution.cpp", "solution.py"]
          .map((fileName) => path.join(dir, fileName))
          .find((filePath) => fs.existsSync(filePath));

        const item = new vscode.TreeItem(slug, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon("file-code");
        if (target) {
          item.command = { command: "vscode.open", title: "Open Solution", arguments: [vscode.Uri.file(target)] };
        }
        return item;
      });
  }
}

module.exports = { TestCasesTreeDataProvider };
