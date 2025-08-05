import * as fs from 'fs';
import { NotebookAnalysis, NotebookCellData } from './types';

// Helper function to convert file:// URLs to actual file paths
function convertFileUrlToPath(filePath: string): string {
  if (filePath.startsWith('file://')) {
    return decodeURIComponent(filePath.replace('file://', ''));
  }
  return filePath;
}

export class BackendAPI {
  private baseUrl: string;
  private uploadInProgress: boolean = false;
  private lastUploadedFile: string | null = null;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async sendChatMessage(message: string): Promise<any> {
    try {
      const https = require('https');
      const http = require('http');
      const url = require('url');
      
      // Use GET method with query parameters to match test_endpoints.py
      const queryParams = new URLSearchParams({ question: message });
      const parsedUrl = url.parse(`${this.baseUrl}/chat?${queryParams}`);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      return new Promise((resolve, reject) => {
        const req = client.request({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.path,
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                return;
              }
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              reject(new Error(`Failed to parse response: ${data}`));
            }
          });
        });

        req.on('error', (err: any) => {
          console.error('HTTP request error:', err);
          reject(err);
        });
        
        req.setTimeout(30000, () => {
          req.destroy();
          reject(new Error('Request timeout - backend may be slow or unavailable'));
        });
        
        req.end();
      });
    } catch (error) {
      console.error('Chat API error:', error);
      throw error;
    }
  }

  async uploadFile(filePath: string): Promise<any> {
    // Convert file path for comparison
    const normalizedPath = convertFileUrlToPath(filePath);
    
    // Prevent duplicate uploads of the same file
    if (this.lastUploadedFile === normalizedPath) {
      return { success: true, message: 'File already uploaded', file_path: this.lastUploadedFile };
    }
    
    // Prevent duplicate uploads
    if (this.uploadInProgress) {
      return { success: false, message: 'Upload already in progress' };
    }
    
    this.uploadInProgress = true;
    
    try {
      const https = require('https');
      const http = require('http');
      const url = require('url');
      const FormData = require('form-data');
      
      // Convert file:// URL to actual file path using helper function
      const actualFilePath = convertFileUrlToPath(filePath);
      
      // Check if file exists before attempting upload
      if (!fs.existsSync(actualFilePath)) {
        throw new Error(`File not found: ${actualFilePath}`);
      }
      const parsedUrl = url.parse(`${this.baseUrl}/upload`);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const form = new FormData();
      form.append('file', fs.createReadStream(actualFilePath));
      
      return new Promise((resolve, reject) => {
        const req = client.request({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.path,
          method: 'POST',
          headers: form.getHeaders()
        }, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                return;
              }
              const parsed = JSON.parse(data);
              // Store the uploaded file path to prevent duplicate uploads
              this.lastUploadedFile = normalizedPath;
              resolve(parsed);
            } catch (e) {
              reject(new Error(`Failed to parse response: ${data.substring(0, 200)}`));
            }
          });
        });

        req.on('error', (err: any) => {
          reject(err);
        });
        
        req.setTimeout(60000, () => {
          req.destroy();
          reject(new Error('Upload timeout - file may be too large or network is slow'));
        });
        
        form.pipe(req);
      });
    } catch (error) {
      throw error;
    } finally {
      this.uploadInProgress = false;
    }
  }

  async sendNotebookAnalysis(analysis: NotebookAnalysis, cellData?: NotebookCellData[]): Promise<any> {
    try {
      const https = require('https');
      const http = require('http');
      const url = require('url');
      
      const parsedUrl = url.parse(`${this.baseUrl}/notebook-analysis`);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const postData = JSON.stringify({
        analysis,
        cellData: cellData || [],
        timestamp: new Date().toISOString()
      });

      return new Promise((resolve, reject) => {
        const req = client.request({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                return;
              }
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Failed to parse response: ${data}`));
            }
          });
        });

        req.on('error', (err: any) => {
          console.error('Notebook analysis request error:', err);
          reject(err);
        });
        
        req.setTimeout(15000, () => {
          req.destroy();
          reject(new Error('Notebook analysis timeout'));
        });
        
        req.write(postData);
        req.end();
      });
    } catch (error) {
      console.error('Notebook analysis API error:', error);
      throw error;
    }
  }

  async getSuggestions(): Promise<any> {
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const https = require('https');
        const http = require('http');
        const url = require('url');
        
        const parsedUrl = url.parse(`${this.baseUrl}/suggestions`);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        return new Promise((resolve, reject) => {
        const req = client.request({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.path,
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                return;
              }
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              reject(new Error(`Failed to parse response: ${data}`));
            }
          });
        });

        req.on('error', (err: any) => {
          console.error('Suggestions API error:', err);
          reject(err);
        });
        
        req.setTimeout(10000, () => {
          req.destroy();
          reject(new Error('Suggestions request timeout'));
        });
        
        req.end();
      });
      
      // If we get here, the request was successful
      break;
      
    } catch (error) {
      console.error(`Suggestions API error (attempt ${attempt}):`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  }

  async getVisualizations(): Promise<any> {
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const https = require('https');
        const http = require('http');
        const url = require('url');
        
        const parsedUrl = url.parse(`${this.baseUrl}/visualize`);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        return new Promise((resolve, reject) => {
        const req = client.request({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.path,
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                return;
              }
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              reject(new Error(`Failed to parse response: ${data}`));
            }
          });
        });

        req.on('error', (err: any) => {
          console.error('Visualizations API error:', err);
          reject(err);
        });
        
        req.setTimeout(10000, () => {
          req.destroy();
          reject(new Error('Visualizations request timeout'));
        });
        
        req.end();
      });
      
      // If we get here, the request was successful
      break;
      
    } catch (error) {
      console.error(`Visualizations API error (attempt ${attempt}):`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  }

  async getAnalysis(code?: string): Promise<any> {
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const https = require('https');
        const http = require('http');
        const url = require('url');
        
        const parsedUrl = url.parse(`${this.baseUrl}/analyze`);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        const method = code ? 'POST' : 'GET';
        const postData = code ? JSON.stringify({ code }) : null;
        
        return new Promise((resolve, reject) => {
        const req = client.request({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.path,
          method: method,
          headers: {
            'Content-Type': 'application/json',
            ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
          }
        }, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                return;
              }
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              reject(new Error(`Failed to parse response: ${data}`));
            }
          });
        });

        req.on('error', (err: any) => {
          console.error('Analysis API error:', err);
          reject(err);
        });
        
        req.setTimeout(10000, () => {
          req.destroy();
          reject(new Error('Analysis request timeout'));
        });
        
        if (postData) {
          req.write(postData);
        }
        req.end();
      });
      
      // If we get here, the request was successful
      break;
      
    } catch (error) {
      console.error(`Analysis API error (attempt ${attempt}):`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  }

  async verifyUpload(filePath: string): Promise<boolean> {
    try {
      // Convert file:// URL to actual file path for verification
      const actualFilePath = convertFileUrlToPath(filePath);
      
      // Simple verification by checking if we can get analysis
      const result = await this.getAnalysis();
      return true;
    } catch (error) {
      console.error('Upload verification failed:', error);
      return false;
    }
  }

  // Method to clear the last uploaded file (useful for testing or when switching files)
  clearLastUploadedFile(): void {
    this.lastUploadedFile = null;
  }

  async generateCode(suggestionData: any): Promise<any> {
    try {
      const https = require('https');
      const http = require('http');
      const url = require('url');
      
      const topic = suggestionData.topic || '';
      const option = suggestionData.option || '';
      const queryParams = new URLSearchParams({ topic, option });
      const parsedUrl = url.parse(`${this.baseUrl}/code?${queryParams}`);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      return new Promise((resolve, reject) => {
        const req = client.request({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.path,
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                return;
              }
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              reject(new Error(`Failed to parse response: ${data}`));
            }
          });
        });

        req.on('error', (err: any) => {
          console.error('Code generation API error:', err);
          reject(err);
        });
        
        req.setTimeout(15000, () => {
          req.destroy();
          reject(new Error('Code generation timeout'));
        });
        
        req.end();
      });
    } catch (error) {
      console.error('Code generation API error:', error);
      throw error;
    }
  }
}