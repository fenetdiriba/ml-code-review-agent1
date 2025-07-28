import * as vscode from 'vscode';
import { BackendAPI } from '../backendAPI';
import { MessageHandler } from './messageHandler';

export class FileUploadHandler {
  private api: BackendAPI;
  private messageHandler: MessageHandler;

  constructor(api: BackendAPI, messageHandler: MessageHandler) {
    this.api = api;
    this.messageHandler = messageHandler;
  }

  public async handleUploadFile(): Promise<void> {
    const options = {
      canSelectMany: false,
      openLabel: 'Select File',
      filters: {
        'All Files': ['*'],
        'Code Files': ['py', 'js', 'java', 'cpp', 'r', 'txt', 'md'],
        'Data Files': ['csv', 'json', 'xml'],
        'Documents': ['txt', 'md', 'pdf']
      }
    };

    const fileUri = await vscode.window.showOpenDialog(options);
    if (fileUri && fileUri[0]) {
      const filePath = fileUri[0].fsPath;
      const fileName = require('path').basename(filePath);
      
      this.messageHandler.addMessage('user', `📄 Uploading file: ${fileName}`);
      
      try {
        const result = await this.api.uploadFile(filePath);
        if (result && result.success) {
          const responseText = `✅ File "${fileName}" uploaded successfully!\n\n📊 Analysis:\n${result.analysis || result.message || 'File processed successfully.'}`;
          this.messageHandler.addMessage('assistant', responseText);
        } else {
          const errorMsg = result?.error || 'Unknown error - please check if backend server is running on port 3000';
          this.messageHandler.addMessage('assistant', `❌ Upload failed: ${errorMsg}`);
        }
      } catch (error: any) {
        this.messageHandler.addMessage('assistant', `❌ Upload failed: ${error?.message || 'Unknown error'}`);
      }
    }
  }

  public async handleUploadImage(): Promise<void> {
    const options = {
      canSelectMany: false,
      openLabel: 'Select Image',
      filters: {
        'Images': ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg']
      }
    };

    const fileUri = await vscode.window.showOpenDialog(options);
    if (fileUri && fileUri[0]) {
      const filePath = fileUri[0].fsPath;
      const fileName = require('path').basename(filePath);
      
      this.messageHandler.addMessage('user', `🖼️ Uploading image: ${fileName}`);
      
      try {
        const result = await this.api.uploadFile(filePath);
        if (result && result.success) {
          const responseText = `✅ Image "${fileName}" uploaded successfully!\n\n🔍 Analysis:\n${result.analysis || result.message || 'Image processed successfully.'}`;
          this.messageHandler.addMessage('assistant', responseText);
        } else {
          const errorMsg = result?.error || 'Unknown error - please check if backend server is running on port 3000';
          this.messageHandler.addMessage('assistant', `❌ Upload failed: ${errorMsg}`);
        }
      } catch (error: any) {
        this.messageHandler.addMessage('assistant', `❌ Upload failed: ${error?.message || 'Unknown error'}`);
      }
    }
  }

  public async handleUploadNotebook(): Promise<void> {
    const options = {
      canSelectMany: false,
      openLabel: 'Select Jupyter Notebook',
      filters: {
        'Jupyter Notebooks': ['ipynb']
      }
    };

    const fileUri = await vscode.window.showOpenDialog(options);
    if (fileUri && fileUri[0]) {
      const filePath = fileUri[0].fsPath;
      const fileName = require('path').basename(filePath);
      
      this.messageHandler.addMessage('user', `📓 Uploading notebook: ${fileName}`);
      
      try {
        const result = await this.api.uploadFile(filePath);
        if (result && result.success) {
          const responseText = `✅ Notebook "${fileName}" uploaded successfully!\n\n📊 Analysis:\n${result.analysis || result.message || 'Notebook processed successfully.'}\n\n📈 Code cells analyzed: ${result.code_cells || 'N/A'}`;
          this.messageHandler.addMessage('assistant', responseText);
        } else {
          const errorMsg = result?.error || 'Unknown error - please check if backend server is running on port 3000';
          this.messageHandler.addMessage('assistant', `❌ Upload failed: ${errorMsg}`);
        }
      } catch (error: any) {
        this.messageHandler.addMessage('assistant', `❌ Upload failed: ${error?.message || 'Unknown error'}`);
      }
    }
  }
}