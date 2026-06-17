# Antigravity IDE Status Monitor Extension

This is a premium, high-visibility traffic light extension designed for the **Google Antigravity IDE**. It monitors your active agent/sub-conversation status in real-time, giving you an immediate visual cue of the agent's current state from across the room.

![Traffic Light States](https://img.shields.io/badge/Traffic_Light-Red_%7C_Yellow_%7C_Green-brightgreen)

## 🚦 Traffic Light Indications

- 🟢 **Green (Idle)**: The agent has finished its response and is waiting for your next input. You can freely type and chat.
- 🟡 **Yellow Flashing (Action Required)**: The agent is waiting for your manual confirmation or input (e.g. approving a terminal command, answering a question, or allowing file changes).
- 🔴 **Red (Busy)**: The agent is actively busy (thinking, running code, analyzing files, or searching the web).

---

## 🛠️ Features

1. **Massive Webview Panel**: Open the traffic light in a large, dedicated editor tab. You can drag it to a second monitor, split pane, or expand it to fullscreen.
2. **Sidebar View**: Seamlessly integrated into the Activity Bar for quick, unobtrusive monitoring.
3. **Double-Monitoring Engine**:
   - **Log-Watching Mode (Zero Configuration)**: Automatically scans the local brain storage (`~/.gemini/antigravity-ide/brain`) for the active conversation log (`transcript.jsonl`) and tracks state transitions.
   - **CDP DOM Inspector (100% Precision)**: Directly connects to the IDE window using the Chrome DevTools Protocol to immediately detect permission buttons (e.g. *Run*, *Accept*, *Always Allow*).
4. **Interactive Controls**:
   - **Audio Cues**: Optional audio alerts (synthesized sine wave beeps) when status changes.
   - **Manual Simulation Overrides**: Click on the traffic light bulbs or use the Dev panel at the bottom to manually toggle states for testing and display.
   - **Modern Aesthetics**: Curated dark/light mode responsive glassmorphism housing with glowing bulb overlays.

---

## 🚀 How to Install and Load the Extension

Since the Antigravity IDE is built on top of VS Code, you can load and run this extension locally:

### 1. Compile or Package (Optional)
If you wish to sideload, copy the folder to your extensions folder:
- **Windows**: `C:\Users\<Your-Username>\.antigravity\extensions\agy-status` (or `.vscode\extensions\agy-status` depending on installation directory).

Alternatively, open this folder in the IDE and press **F5** to start a new Extension Development Host instance.

---

## 🔌 Activating CDP Mode (Recommended for Yellow Flashing Light)

To allow the extension to inspect the live window DOM and instantly trigger the flashing yellow light upon showing permission dialogs, launch the Antigravity IDE with the remote debugging port enabled:

### Windows:
Launch the IDE from your terminal/command prompt:
```powershell
& "Antigravity IDE.exe" --remote-debugging-port=9000
```

*Note: If remote debugging is not enabled, the extension automatically falls back to **Log-Watching Mode**, which uses file parser heuristics.*

---

## ⚙️ Development & Testing

You can manually trigger states directly inside the Webview page by clicking the **Simulation Controls** (Red, Yellow, Green buttons) to test the transition beeps and animations.

License: MIT
