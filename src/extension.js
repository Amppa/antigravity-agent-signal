const vscode = require('vscode');
const LogMonitor = require('./logMonitor');
const CdpMonitor = require('./cdpMonitor');
const WebviewManager = require('./webviewManager');

let webviewManager = null;
let logMonitor = null;
let cdpMonitor = null;

// Global state store
const state = {
  logStatus: 'idle',
  logDescription: 'Extension activated.',
  cdpConnected: false,
  cdpPending: false,
  cdpPort: 9000,
  convId: 'Searching...',
  watchFile: 'Searching...'
};

function activate(context) {
  console.log('Antigravity Status Monitor extension activated.');

  webviewManager = new WebviewManager(context.extensionPath);

  // Callback from log monitor
  logMonitor = new LogMonitor((logState) => {
    state.logStatus = logState.status;
    state.logDescription = logState.description;
    state.convId = logState.convId;
    state.watchFile = logState.watchFile;
    updateAndBroadcast();
  });

  // Callback from CDP monitor
  cdpMonitor = new CdpMonitor({
    port: 9000,
    onConnectionChange: (connected, port) => {
      state.cdpConnected = connected;
      state.cdpPort = port;
      if (!connected) {
        state.cdpPending = false;
      }
      updateAndBroadcast();
    },
    onApprovalDetected: (detected) => {
      state.cdpPending = detected;
      updateAndBroadcast();
    }
  });

  // Start background monitoring loops
  logMonitor.start();
  cdpMonitor.start();

  // Register command to open Webview Panel (in main editor area)
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity-status.show', () => {
      const panel = vscode.window.createWebviewPanel(
        'antigravityStatusPanel',
        'Antigravity Status Monitor',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      webviewManager.addWebview(panel.webview, handleWebviewMessage);
      
      panel.onDidDispose(() => {
        webviewManager.removeWebview(panel.webview);
      });

      // Send initial state
      sendStateToWebview(panel.webview);
    })
  );

  // Register Sidebar Webview View Provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'antigravityStatusSidebar',
      {
        resolveWebviewView(webviewView) {
          webviewView.webview.options = {
            enableScripts: true
          };

          webviewManager.addWebview(webviewView.webview, handleWebviewMessage);

          webviewView.onDidDispose(() => {
            webviewManager.removeWebview(webviewView.webview);
          });

          // Send initial state
          sendStateToWebview(webviewView.webview);
        }
      },
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  // Register disposal of monitors
  context.subscriptions.push({
    dispose: () => {
      stopAllMonitors();
    }
  });
}

function handleWebviewMessage(message) {
  if (message.command === 'manualOverride') {
    console.log(`Manual override from webview: ${message.status}`);
    state.logStatus = message.status;
    state.logDescription = `Manual Override: Set to ${message.status.toUpperCase()}`;
    // If it's override to something else, clear CDP pending state to allow override to show
    if (message.status !== 'waiting') {
      state.cdpPending = false;
    }
    updateAndBroadcast();
  }
}

function updateAndBroadcast() {
  // Determine overall status and description based on priorities
  let overallStatus = state.logStatus;
  let overallDescription = state.logDescription;

  // CDP pending state overrides log state
  if (state.cdpPending) {
    overallStatus = 'waiting';
    overallDescription = 'CDP detected pending approval buttons on screen.';
  }

  const payload = {
    command: 'updateState',
    status: overallStatus,
    description: overallDescription,
    diagnostics: {
      convId: state.convId,
      watchFile: state.watchFile,
      cdpConnected: state.cdpConnected,
      cdpPort: state.cdpPort
    }
  };

  webviewManager.broadcast(payload);
}

function sendStateToWebview(webview) {
  let overallStatus = state.logStatus;
  let overallDescription = state.logDescription;

  if (state.cdpPending) {
    overallStatus = 'waiting';
    overallDescription = 'CDP detected pending approval buttons on screen.';
  }

  try {
    webview.postMessage({
      command: 'updateState',
      status: overallStatus,
      description: overallDescription,
      diagnostics: {
        convId: state.convId,
        watchFile: state.watchFile,
        cdpConnected: state.cdpConnected,
        cdpPort: state.cdpPort
      }
    });
  } catch (e) {
    console.error('Failed to send initial state to webview:', e);
  }
}

function stopAllMonitors() {
  if (logMonitor) logMonitor.stop();
  if (cdpMonitor) cdpMonitor.stop();
}

function deactivate() {
  stopAllMonitors();
}

module.exports = {
  activate,
  deactivate
};
