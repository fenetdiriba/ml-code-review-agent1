import * as fs from 'fs';
import { NotebookAnalysis, NotebookCellData } from './types';

export class BackendAPI {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async sendChatMessage(message: string): Promise<any> {
    try {
      const https = require('https');
      const http = require('http');
      const url = require('url');
      
      const parsedUrl = url.parse(`${this.baseUrl}/chat`);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const postData = JSON.stringify({
        message
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
        
        req.setTimeout(10000, () => {
          req.destroy();
          reject(new Error('Request timeout - backend may be slow or unavailable'));
        });
        
        req.write(postData);
        req.end();
      });
    } catch (error) {
      console.error('Chat API error:', error);
      throw error;
    }
  }

  async uploadFile(filePath: string): Promise<any> {
    try {
      const https = require('https');
      const http = require('http');
      const url = require('url');
      const FormData = require('form-data');
      
      console.log(`Attempting to upload file: ${filePath} to ${this.baseUrl}/upload`);
      const parsedUrl = url.parse(`${this.baseUrl}/upload`);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));
      
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
              console.log(`Upload response status: ${res.statusCode}, data: ${data.substring(0, 500)}`);
              if (res.statusCode !== 200) {
                console.error(`Upload failed with status ${res.statusCode}:`, data);
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                return;
              }
              const parsed = JSON.parse(data);
              console.log('Upload successful:', parsed);
              resolve(parsed);
            } catch (e) {
              console.error('Failed to parse upload response:', data);
              reject(new Error(`Failed to parse response: ${data.substring(0, 200)}`));
            }
          });
        });

        req.on('error', (err: any) => {
          console.error('Upload request error:', err);
          reject(err);
        });
        
        req.setTimeout(30000, () => {
          req.destroy();
          reject(new Error('Upload timeout - file may be too large'));
        });
        
        form.pipe(req);
      });
    } catch (error) {
      console.error('Upload API error:', error);
      throw error;
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
}