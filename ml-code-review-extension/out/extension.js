"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const backendAPI_1 = require("./backendAPI");
const chatPanel_1 = require("./chatPanel");
function activate(context) {
    console.log('🚀 ML Code Review extension is now activating!');
    vscode.window.showInformationMessage('ML Code Review extension activated!');
    const api = new backendAPI_1.BackendAPI();
    const chatPanel = new chatPanel_1.ChatPanel(api, context);
    const openChat = vscode.commands.registerCommand('mlCodeReview.openChat', () => {
        chatPanel.show();
    });
    context.subscriptions.push(openChat);
    context.subscriptions.push({
        dispose: () => {
            chatPanel.dispose();
        }
    });
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map