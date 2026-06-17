const fs = require('fs');
const path = require('path');
const os = require('os');

class LogMonitor {
  constructor(onStateChange) {
    this.onStateChange = onStateChange;
    this.interval = null;
    this.watchedConversationId = '';
    this.watchedLogFilePath = '';
    this.lastTranscriptSize = 0;
    this.lastTranscriptChangeTime = Date.now();
  }

  start() {
    this.interval = setInterval(() => this.monitorLogs(), 800);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  monitorLogs() {
    try {
      const brainPath = path.join(os.homedir(), '.gemini', 'antigravity-ide', 'brain');
      if (!fs.existsSync(brainPath)) {
        this.onStateChange({
          status: 'idle',
          description: `Waiting for Antigravity directory structure at ${brainPath}...`,
          convId: 'Searching...',
          watchFile: 'Searching...'
        });
        return;
      }

      const items = fs.readdirSync(brainPath);
      const conversations = [];

      for (const item of items) {
        const itemPath = path.join(brainPath, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory() && /^[a-f0-9-]{36}$/i.test(item)) {
          const logFile = path.join(itemPath, '.system_generated', 'logs', 'transcript.jsonl');
          if (fs.existsSync(logFile)) {
            const logStat = fs.statSync(logFile);
            conversations.push({
              id: item,
              logFile: logFile,
              mtime: logStat.mtimeMs
            });
          }
        }
      }

      if (conversations.length === 0) {
        this.onStateChange({
          status: 'idle',
          description: 'No active agent conversations detected.',
          convId: 'Searching...',
          watchFile: 'Searching...'
        });
        return;
      }

      conversations.sort((a, b) => b.mtime - a.mtime);
      const latest = conversations[0];

      this.watchedConversationId = latest.id;
      this.watchedLogFilePath = latest.logFile;

      // Track file changes for staleness detection
      const currentFileSize = fs.statSync(latest.logFile).size;
      if (currentFileSize !== this.lastTranscriptSize) {
        this.lastTranscriptSize = currentFileSize;
        this.lastTranscriptChangeTime = Date.now();
      }

      const content = fs.readFileSync(latest.logFile, 'utf8').trim();
      if (!content) {
        this.onStateChange({
          status: 'idle',
          description: 'Conversation log is empty.',
          convId: this.watchedConversationId,
          watchFile: path.basename(this.watchedLogFilePath)
        });
        return;
      }

      const lines = content.split('\n');
      const steps = [];
      for (const line of lines) {
        try {
          steps.push(JSON.parse(line));
        } catch (e) {}
      }

      if (steps.length === 0) {
        this.onStateChange({
          status: 'idle',
          description: 'Failed to parse conversation logs.',
          convId: this.watchedConversationId,
          watchFile: path.basename(this.watchedLogFilePath)
        });
        return;
      }

      // Step types that are system/meta and don't represent actual agent work
      const SYSTEM_STEP_TYPES = new Set([
        'CONVERSATION_HISTORY',
        'KNOWLEDGE_ARTIFACTS',
        'EPHEMERAL_MESSAGE',
        'SYSTEM_MESSAGE',
      ]);

      // Find the last meaningful step (skip system-only steps)
      let lastStep = steps[steps.length - 1];
      for (let i = steps.length - 1; i >= 0; i--) {
        if (!SYSTEM_STEP_TYPES.has(steps[i].type)) {
          lastStep = steps[i];
          break;
        }
      }

      // Also find the most recent PLANNER_RESPONSE for context
      let lastPlannerResponse = null;
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].type === 'PLANNER_RESPONSE') {
          lastPlannerResponse = steps[i];
          break;
        }
      }

      // Count how many tool result steps follow the last PLANNER_RESPONSE
      let toolResultsAfterPlanner = 0;
      let expectedToolCalls = 0;
      if (lastPlannerResponse) {
        expectedToolCalls = (lastPlannerResponse.tool_calls || []).length;
        const plannerIdx = steps.indexOf(lastPlannerResponse);
        for (let i = plannerIdx + 1; i < steps.length; i++) {
          if (!SYSTEM_STEP_TYPES.has(steps[i].type) && steps[i].type !== 'PLANNER_RESPONSE') {
            toolResultsAfterPlanner++;
          }
        }
      }

      let newStatus = 'idle';
      let description = 'Agent is idle.';

      // Determine if there is a pending approval tool call
      let hasPendingApproval = false;
      if (lastStep.status === 'CANCELLED' || lastStep.type === 'USER_CANCELLED') {
        // Cancelled -> not waiting for approval
      } else if (lastStep.status === 'PENDING') {
        const type = lastStep.type || '';
        if (type.includes('RUN_COMMAND') || type.includes('ASK_PERMISSION') || type.includes('ASK_QUESTION')) {
          hasPendingApproval = true;
        }
      } else if (lastStep.status === 'RUNNING') {
        let isWaitingForInput = false;
        try {
          const stepIndex = lastStep.step_index;
          const taskLogPath = path.join(brainPath, this.watchedConversationId, '.system_generated', 'tasks', `task-${stepIndex}.log`);
          if (fs.existsSync(taskLogPath)) {
            const logContent = fs.readFileSync(taskLogPath, 'utf8');
            const lowerLog = logContent.toLowerCase();
            if (
              lowerLog.includes('permission') ||
              lowerLog.includes('premission') ||
              lowerLog.includes('skip/submit') ||
              lowerLog.includes('submit') ||
              lowerLog.includes('skip') ||
              lowerLog.includes('y/n') ||
              lowerLog.includes('[y/n]')
            ) {
              isWaitingForInput = true;
            }
          }
        } catch (e) {}
        if (isWaitingForInput) {
          hasPendingApproval = true;
        }
      } else if (lastStep.type === 'PLANNER_RESPONSE') {
        const toolCalls = lastStep.tool_calls || [];
        const requiresApproval = toolCalls.some(tc => {
          const name = tc.name || '';
          return name.includes('run_command') || name.includes('ask_permission') || name.includes('ask_question');
        });
        if (requiresApproval) {
          hasPendingApproval = true;
        }
      } else if (lastPlannerResponse) {
        // Last step is a completed tool result
        const toolCalls = lastPlannerResponse.tool_calls || [];
        const requiresApproval = toolCalls.some(tc => {
          const name = tc.name || '';
          return name.includes('run_command') || name.includes('ask_permission') || name.includes('ask_question');
        });
        if (requiresApproval && toolResultsAfterPlanner < expectedToolCalls) {
          hasPendingApproval = true;
        }
      }

      // Base status logic (instant checks)
      if (lastStep.status === 'CANCELLED' || lastStep.type === 'USER_CANCELLED') {
        newStatus = 'idle';
        description = 'Agent execution cancelled.';
      } else if (hasPendingApproval) {
        newStatus = 'waiting';
        description = 'Waiting for user confirmation.';
      } else if (lastStep.status === 'PENDING' || lastStep.status === 'RUNNING') {
        newStatus = 'busy';
        description = 'Agent is busy.';
      } else if (lastStep.type === 'USER_INPUT') {
        newStatus = 'busy';
        description = 'Agent is busy.';
      } else if (lastStep.type === 'PLANNER_RESPONSE') {
        const toolCalls = lastStep.tool_calls || [];
        if (toolCalls.length === 0) {
          newStatus = 'idle';
          description = 'Agent is idle.';
        } else {
          newStatus = 'busy';
          description = 'Agent is busy.';
        }
      } else {
        // Completed tool result
        newStatus = 'busy';
        description = 'Agent is busy.';
      }

      // Staleness and Cancellation detection logic
      const timeSinceLastChange = Date.now() - this.lastTranscriptChangeTime;
      const STALE_TIMEOUT_MS = 10000; // 10 seconds
      const CONVERSATION_STALE_MS = 5 * 60 * 1000; // 5 minutes

      if (newStatus === 'busy' && timeSinceLastChange > STALE_TIMEOUT_MS) {
        // If the status is busy, but we haven't seen any updates for 10 seconds:
        // The agent is either cancelled, finished, or running a very slow tool.
        let isTaskActive = false;
        if (lastStep.status === 'RUNNING') {
          try {
            const stepIndex = lastStep.step_index;
            const taskLogPath = path.join(brainPath, this.watchedConversationId, '.system_generated', 'tasks', `task-${stepIndex}.log`);
            if (fs.existsSync(taskLogPath)) {
              const logStat = fs.statSync(taskLogPath);
              if (Date.now() - logStat.mtimeMs < 15000) {
                isTaskActive = true;
              }
            }
          } catch (e) {}
        }
        
        if (!isTaskActive) {
          newStatus = 'idle';
          description = 'Agent is idle or execution was cancelled.';
        }
      }

      // If the conversation is very stale (5+ minutes), treat as idle
      if (timeSinceLastChange > CONVERSATION_STALE_MS && newStatus === 'busy') {
        newStatus = 'idle';
        description = 'Agent conversation appears inactive.';
      }

      this.onStateChange({
        status: newStatus,
        description: description,
        convId: this.watchedConversationId,
        watchFile: path.basename(this.watchedLogFilePath)
      });

    } catch (err) {
      console.error('Error monitoring logs:', err);
    }
  }
}

module.exports = LogMonitor;
