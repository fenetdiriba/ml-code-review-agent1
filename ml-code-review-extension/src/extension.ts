import * as vscode from 'vscode';
import { BackendAPI } from './backendAPI';
import { ChatPanel } from './chatPanel';

export function activate(context: vscode.ExtensionContext) {
  console.log('🚀 ML Code Review extension is now activating!');
  console.log('📁 Extension context:', context.extensionPath);
  vscode.window.showInformationMessage('ML Code Review extension activated!');
  
  const api = new BackendAPI();
  console.log('🔌 BackendAPI initialized');
  const chatPanel = new ChatPanel(api, context);
  console.log('💬 ChatPanel initialized');

  const openChat = vscode.commands.registerCommand('mlCodeReview.openChat', async () => {
    console.log('🎯 mlCodeReview.openChat command triggered');
    await chatPanel.show();
  });

  context.subscriptions.push(openChat);
  context.subscriptions.push({
    dispose: () => {
      chatPanel.dispose();
    }
  });
}

export function deactivate() {}