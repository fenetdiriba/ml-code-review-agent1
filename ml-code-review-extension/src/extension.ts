import * as vscode from 'vscode';
import { BackendAPI } from './backendAPI';
import { ChatPanel } from './chatPanel';

export function activate(context: vscode.ExtensionContext) {
  console.log('🚀 ML Code Review extension is now activating!');
  vscode.window.showInformationMessage('ML Code Review extension activated!');
  
  const api = new BackendAPI();
  const chatPanel = new ChatPanel(api, context);

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

export function deactivate() {}