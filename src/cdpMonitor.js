class CdpMonitor {
  constructor(options) {
    this.port = options.port || 9000;
    this.onConnectionChange = options.onConnectionChange || (() => {});
    this.onApprovalDetected = options.onApprovalDetected || (() => {});

    this.interval = null;
    this.activeSocket = null;
    this.connected = false;
  }

  start() {
    this.interval = setInterval(() => this.monitorCDP(), 1500);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.activeSocket) {
      try {
        this.activeSocket.close();
      } catch (e) {}
      this.activeSocket = null;
    }
    if (this.connected) {
      this.connected = false;
      this.onConnectionChange(false, this.port);
    }
  }

  async monitorCDP() {
    if (this.connected && this.activeSocket && this.activeSocket.readyState === 1) {
      this.queryCDPApprovalButtons();
      return;
    }

    try {
      const url = `http://localhost:${this.port}/json`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Port not open');

      const targets = await response.json();
      const pageTarget = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);

      if (pageTarget) {
        const wsUrl = pageTarget.webSocketDebuggerUrl;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          this.connected = true;
          this.activeSocket = ws;
          this.onConnectionChange(true, this.port);
        };

        ws.onmessage = (event) => {
          try {
            const res = JSON.parse(event.data);
            if (res.id === 42 && res.result && res.result.result) {
              const hasApprovalButton = !!res.result.result.value;
              this.onApprovalDetected(hasApprovalButton);
            }
          } catch (e) {}
        };

        ws.onerror = (err) => {
          this.cleanupSocket();
        };

        ws.onclose = () => {
          this.cleanupSocket();
        };
      } else {
        this.cleanupSocket();
      }
    } catch (e) {
      this.cleanupSocket();
    }
  }

  cleanupSocket() {
    if (this.activeSocket) {
      try { this.activeSocket.close(); } catch (e) {}
      this.activeSocket = null;
    }
    if (this.connected) {
      this.connected = false;
      this.onConnectionChange(false, this.port);
      this.onApprovalDetected(false);
    }
  }

  queryCDPApprovalButtons() {
    if (!this.activeSocket || this.activeSocket.readyState !== 1) return;

    const expression = `(() => {
      function checkDoc(doc) {
        if (!doc) return false;
        
        // 1. Text based check (e.g. for terminal inputs / prompts)
        const text = (doc.body ? doc.body.innerText : doc.textContent || '').toLowerCase();
        if (
          text.includes('request you permission') ||
          text.includes('request you premission') ||
          text.includes('skip/submit') ||
          text.includes('waiting for your approval') ||
          text.includes('always allow')
        ) {
          return true;
        }

        // 2. Button based check
        const elements = Array.from(doc.querySelectorAll('button, [role="button"], .button, .monaco-button, a'));
        const hasBtn = elements.some(el => {
          const txt = (el.textContent || el.innerText || '').trim();
          return txt.includes('Accept') || 
                 txt.includes('Run') || 
                 txt.includes('Always Allow') || 
                 txt.includes('Allow') || 
                 txt.includes('Submit') || 
                 txt.includes('Confirm') || 
                 txt.includes('Yes') || 
                 txt.includes('OK') || 
                 txt.includes('Proceed') ||
                 txt.includes('授權') || 
                 txt.includes('運行') || 
                 txt.includes('同意') || 
                 txt.includes('確定') || 
                 txt.includes('確認') || 
                 txt.includes('送出') || 
                 txt.includes('是');
        });
        if (hasBtn) return true;

        // 3. Shadow roots check
        const allElements = doc.querySelectorAll('*');
        for (const el of allElements) {
          if (el.shadowRoot && checkDoc(el.shadowRoot)) return true;
        }

        // 4. Iframes check
        const iframes = doc.querySelectorAll('iframe');
        for (const iframe of iframes) {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (checkDoc(iframeDoc)) return true;
          } catch (e) {}
        }
        return false;
      }
      return checkDoc(document);
    })()`;

    try {
      this.activeSocket.send(JSON.stringify({
        id: 42,
        method: "Runtime.evaluate",
        params: {
          expression: expression,
          returnByValue: true
        }
      }));
    } catch (e) {
      console.error('Failed to send CDP query:', e);
    }
  }
}

module.exports = CdpMonitor;
