# yt-dlp Web App - AI Coding Agent Instructions

## Architecture Overview

This is a **Bun-native** full-stack TypeScript app providing a web UI for yt-dlp video downloads with real-time progress tracking.

**Key Components:**

- **Backend:** Bun HTTP server + WebSocket for real-time progress (`src/index.ts`, `src/apps/backend/`)
- **Frontend:** React 19 + Tailwind CSS 4 with WebSocket client (`src/apps/frontend/`)
- **Download Engine:** `YtDlpCli` class spawns yt-dlp processes, parses stdout for progress (`src/apps/backend/yt-dlp-cli.ts`)
- **Queue Manager:** `DownloadQueueManager` handles concurrent downloads (max 3), broadcasts to WebSocket clients (`src/apps/backend/download-queue.ts`)

## Critical Patterns

### 1. WebSocket Architecture (Real-time Progress)

- Server uses Bun's native WebSocket support - check `req.headers.get("upgrade") === "websocket"` then `server.upgrade(req)`
- Client subscribes to download jobs via WebSocket messages (type: "subscribe", "download-request", etc.)
- Progress parsing happens in `YtDlpCli.download()` - uses `Bun.spawn()` with piped stdout, line-by-line parsing with `TextDecoder`
- Broadcast pattern: `DownloadQueueManager.wsClients` Map tracks subscribers per job ID

### 2. yt-dlp Integration

- **Never use Node.js child_process** - use `Bun.spawn()` for yt-dlp (see `yt-dlp-cli.ts:113`)
- Progress parsing regex: `(\d+\.?\d*)%` for percent, `at\s+([\d.]+\w+\/s)` for speed
- Use `--newline` flag to get line-by-line progress output
- Format recommendation scoring in `recommendFormat()` prioritizes: av01 (30pts) > vp9 (20pts) > avc1 (10pts), resolution height, bitrate

### 3. Type System & Data Flow

- All types in `src/types.ts` - includes `VideoMetadata | PlaylistMetadata` union for yt-dlp responses
- `DownloadJob` tracks status: "pending" | "downloading" | "completed" | "failed" | "cancelled"
- WebSocket messages use discriminated union `WSMessage` with `type` field (see types.ts:106-150)

### 4. Frontend State Management

- WebSocket connection in `LinkField.tsx` - auto-reconnects on close (3s timeout)
- Downloads Map in state tracks all jobs by ID, updated via WebSocket callbacks
- `Metadata.tsx` receives `onDownload` callback prop to trigger downloads, not direct API calls

## Development Workflows

### Running the App

```bash
bun dev              # Hot-reload dev server (port 3000)
bun start            # Production mode
bun run build.ts     # Build frontend assets to dist/
```

### Docker Deployment

```bash
docker-compose up -d              # Start with docker-compose
docker build -t yt-dlp-web .      # Build image
docker run -p 3000:3000 \
  -v ./downloads:/downloads \
  -v ./data:/app/data \
  yt-dlp-web                      # Run container
```

**Docker volumes:**

- `/downloads` - Persistent download storage
- `/app/data` - Queue state JSON file (`queue-state.json`)

### Key Files to Modify

- **Add API endpoint:** `src/apps/backend/routes.ts` - add to `_apiRoutes` object (auto-prefixed with `/api`)
- **Add WebSocket message type:** Update `src/types.ts` WSMessage types + handler in `src/apps/backend/backend.ts:23`
- **Modify yt-dlp behavior:** `src/apps/backend/yt-dlp-cli.ts` - all CLI interactions happen here

### Environment Variables

- `DOWNLOAD_DIR` - where files are saved (default: `~/Downloads/yt-dlp-web`)
- `PORT` - server port (default: 3000)
- Use `process.env.HOME` for tilde expansion (see `download-queue.ts:22`)

## Data Persistence

**Queue State Management:**

- State persisted to `data/queue-state.json` (auto-created)
- Saves debounced after 1 second of changes (see `download-queue.ts:85`)
- On startup: loads jobs, restores pending queue, marks downloading → pending
- **Always call `this.saveState()` after mutating `jobs` or `queue`**

**State structure:**

```typescript
{ jobs: Array<DownloadJob & { id: string }>, queue: string[] }
```

**Restoration logic:**

- Jobs with status "downloading" reset to "pending" on load
- Queue filtered to only include pending jobs
- Auto-resumes processing after restore

## Project-Specific Conventions

1. **Bun-First:** No npm/node/express - use Bun APIs (`Bun.serve`, `Bun.spawn`, `Bun.file`)
2. **Route Handling:** Manual pathname matching in `src/index.ts:9` (no Express/Fastify router)
3. **Filename Templates:** yt-dlp `-o` flag uses variables like `%(title)s`, `%(uploader)s` - preserve `%(ext)s` always
4. **Progress Streaming:** Don't buffer stdout - use `ReadableStream.getReader()` with line buffering (see yt-dlp-cli.ts:128-154)
5. **Concurrent Limit:** Hardcoded `MAX_CONCURRENT = 3` in `DownloadQueueManager` - process queue when slots available

## Integration Points

- **External Binary:** Requires `yt-dlp` in PATH - spawned via `Bun.spawn(["yt-dlp", ...args])`
- **File Serving:** `/api/files/:filename` endpoint serves from `DOWNLOAD_DIR` - path traversal check at routes.ts:121
- **WebSocket Protocol:** Custom JSON messages (not Socket.IO) - frontend must handle reconnection logic

## Common Pitfalls

1. **WebSocket in Bun:** Must call `server.upgrade(req)` in fetch handler, not separate route
2. **Glob Pattern:** Use `**/*.html` not `**.html` for recursive search (see build.ts:120)
3. **Regex Match Groups:** Always null-check `match[1]` before using (TypeScript strict mode)
4. **yt-dlp Metadata:** Use `--flat-playlist` for playlist detection without downloading
5. **Progress Buffering:** Must split by newline and handle partial lines in buffer (last element after split)

## Testing Patterns

No test framework currently implemented. When adding tests:

- Use `bun test` (built-in test runner)
- Mock `Bun.spawn` for yt-dlp tests
- Mock WebSocket for frontend tests

## File Organization

```
src/
├── index.ts                    # Server entry + WebSocket upgrade
├── types.ts                    # ALL type definitions (shared)
└── apps/
    ├── backend/
    │   ├── backend.ts          # WebSocket handler + exports downloadQueue
    │   ├── routes.ts           # REST API endpoints
    │   ├── yt-dlp-cli.ts       # yt-dlp process management
    │   └── download-queue.ts   # Concurrent download orchestration
    └── frontend/
        ├── LinkField.tsx       # Main form + WebSocket client
        ├── Metadata.tsx        # Format display + download buttons
        └── index.html          # Entry point for Bun.build
```

---

**When extending:** Add WebSocket message type → handler → frontend callback. Always check `YtDlpCli` methods before spawning new yt-dlp processes.
