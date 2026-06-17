const fs = require('fs');
const path = require('path');
const os = require('os');

class LogMonitor {
  constructor(onStateChange) {
    this.onStateChange = onStateChange;
    this.interval = null;
    this.watchedConversationId = '';
    this.watchedLogFilePath = '';
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

      const lastStep = steps[steps.length - 1];

      let newStatus = 'idle';
      let description = 'Agent is idle.';

      if (lastStep.status === 'PENDING') {
        const type = lastStep.type || '';
        if (type.includes('RUN_COMMAND') || type.includes('ASK_PERMISSION') || type.includes('ASK_QUESTION')) {
          newStatus = 'waiting';
          description = 'Waiting for user confirmation.';
        } else {
          newStatus = 'busy';
          description = 'Agent is busy.';
        }
      } else if (lastStep.status === 'RUNNING') {
        // If it's a running command, check if its task log file contains a permission or execution prompt.
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
        } catch (e) {
          console.error('Failed to read task log file for running step:', e);
        }

        if (isWaitingForInput) {
          newStatus = 'waiting';
          description = 'Waiting for user confirmation.';
        } else {
          newStatus = 'busy';
          description = 'Agent is busy.';
        }
      } else if (lastStep.type === 'USER_INPUT') {
        newStatus = 'busy';
        description = 'Agent is busy.';
      } else if (lastStep.type === 'PLANNER_RESPONSE') {
        const toolCalls = lastStep.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
          newStatus = 'idle';
          description = 'Agent is idle.';
        } else {
          const requiresApproval = toolCalls.some(tc => {
            const name = tc.name || '';
            return name.includes('run_command') || name.includes('ask_permission') || name.includes('ask_question');
          });
          
          if (requiresApproval) {
            newStatus = 'waiting';
            description = 'Waiting for user confirmation.';
          } else {
            newStatus = 'busy';
            description = 'Agent is busy.';
          }
        }
      } else {
        newStatus = 'busy';
        description = 'Agent is busy.';
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
