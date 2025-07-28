"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
function activate(context) {
    console.log('Hello World extension is now active!');
    let disposable = vscode.commands.registerCommand('helloWorld.helloWorld', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);
            if (selectedText) {
                vscode.window.showInformationMessage(`Hello! You selected: "${selectedText}"`);
            }
            else {
                vscode.window.showInformationMessage('Hello World from VS Code!');
            }
        }
        else {
            vscode.window.showInformationMessage('Hello World from VS Code!');
        }
    });
    context.subscriptions.push(disposable);
}
exports.activate = activate;
function deactivate() {
    console.log('Hello World extension is now deactivated!');
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map