const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

class WebviewManager {
  constructor(extensionPath) {
    this.extensionPath = extensionPath;
    this.activeWebviews = new Set();
  }

  addWebview(webview, onMessageCallback) {
    this.activeWebviews.add(webview);
    webview.html = this.getWebviewContent();

    webview.onDidReceiveMessage(message => {
      if (onMessageCallback) {
        onMessageCallback(message);
      }
    });
  }

  removeWebview(webview) {
    this.activeWebviews.delete(webview);
  }

  getWebviewContent() {
    const htmlPath = path.join(this.extensionPath, 'resources', 'webview.html');
    try {
      return fs.readFileSync(htmlPath, 'utf8');
    } catch (e) {
      return `<html><body><h1>Error loading webview.html</h1><p>${e.message}</p></body></html>`;
    }
  }

  broadcast(payload) {
    for (const webview of this.activeWebviews) {
      try {
        webview.postMessage(payload);
      } catch (e) {
        this.activeWebviews.delete(webview);
      }
    }
  }
}

module.exports = WebviewManager;
