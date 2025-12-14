import { YtDlpCli } from "./yt-dlp-cli";
import type {
  DownloadJob,
  DownloadRequest,
  DownloadProgress,
  PlaylistMetadata,
} from "../../types";
import { join, resolve } from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";

interface PersistedState {
  jobs: Array<DownloadJob & { id: string }>;
  queue: string[];
}

export class DownloadQueueManager {
  private ytDlp: YtDlpCli;
  private jobs: Map<string, DownloadJob> = new Map();
  private queue: string[] = [];
  private activeDownloads: Set<string> = new Set();
  private readonly MAX_CONCURRENT = 3;
  private downloadDir: string;
  private wsClients: Map<string, Set<WebSocket>> = new Map();
  private stateFile: string;
  private saveTimeout?: Timer;

  constructor(downloadDir: string) {
    this.ytDlp = new YtDlpCli();
    this.downloadDir = resolve(
      downloadDir.replace(/^~/, process.env.HOME || "")
    );
    this.stateFile = resolve(process.cwd(), "data", "queue-state.json");
    this.ensureDownloadDir();
    this.loadState();
  }

  private async ensureDownloadDir() {
    try {
      await mkdir(this.downloadDir, { recursive: true });
      await mkdir(resolve(process.cwd(), "data"), { recursive: true });
    } catch (error) {
      console.error("Failed to create directories:", error);
    }
  }

  private async loadState() {
    try {
      if (existsSync(this.stateFile)) {
        const data = await readFile(this.stateFile, "utf-8");

        // Validate JSON before parsing
        if (!data || data.trim().length === 0) {
          console.warn("State file is empty, skipping load");
          return;
        }

        let state: PersistedState;
        try {
          state = JSON.parse(data);
        } catch (parseError) {
          console.error("Failed to parse state file JSON:", parseError);
          console.error(
            "State file content (first 500 chars):",
            data.substring(0, 500)
          );
          // Backup corrupted state file
          const backupFile = `${this.stateFile}.corrupt.${Date.now()}`;
          await writeFile(backupFile, data, "utf-8");
          console.log(`Corrupted state backed up to: ${backupFile}`);
          return;
        }

        // Restore jobs (but mark downloading as pending since server restarted)
        state.jobs.forEach((job) => {
          if (job.status === "downloading") {
            job.status = "pending";
          }
          // Convert date strings back to Date objects
          if (job.createdAt && typeof job.createdAt === "string") {
            job.createdAt = new Date(job.createdAt);
          }
          if (job.completedAt && typeof job.completedAt === "string") {
            job.completedAt = new Date(job.completedAt);
          }
          this.jobs.set(job.id, job);
        });

        // Restore queue (only pending jobs)
        this.queue = state.queue.filter((id) => {
          const job = this.jobs.get(id);
          return job && job.status === "pending";
        });

        console.log(`Restored ${this.jobs.size} jobs from state file`);

        // Resume processing
        this.processQueue();
      }
    } catch (error) {
      console.error("Failed to load queue state:", error);
    }
  }

  private async saveState() {
    // Debounce saves to avoid excessive writes
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      try {
        const state: PersistedState = {
          jobs: Array.from(this.jobs.entries()).map(([id, job]) => ({
            ...job,
            id,
          })),
          queue: this.queue,
        };

        await writeFile(
          this.stateFile,
          JSON.stringify(state, null, 2),
          "utf-8"
        );
      } catch (error) {
        console.error("Failed to save queue state:", error);
      }
    }, 1000); // Save after 1 second of inactivity
  }

  subscribeToJob(jobId: string, ws: WebSocket) {
    if (!this.wsClients.has(jobId)) {
      this.wsClients.set(jobId, new Set());
    }
    this.wsClients.get(jobId)!.add(ws);
  }

  unsubscribeFromJob(jobId: string, ws: WebSocket) {
    const clients = this.wsClients.get(jobId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.wsClients.delete(jobId);
      }
    }
  }

  private broadcast(jobId: string, message: any) {
    const clients = this.wsClients.get(jobId);
    if (clients) {
      const data = JSON.stringify(message);
      clients.forEach((ws) => {
        try {
          ws.send(data);
        } catch (error) {
          console.error("Failed to send message to client:", error);
        }
      });
    }
  }

  async addDownload(request: DownloadRequest): Promise<string> {
    const jobId = this.generateJobId();
    const type = await this.ytDlp.detectType(request.url);

    // Try to fetch title from metadata
    let title: string | undefined;
    try {
      const metadata = await this.ytDlp.getMetadata(request.url);
      if (metadata.metadata) {
        title = metadata.metadata.title;
      }
    } catch (error) {
      console.log("Failed to fetch title, continuing without it:", error);
    }

    // Build output path
    let outputPath = this.downloadDir;
    if (request.subfolder) {
      outputPath = join(outputPath, request.subfolder);
    }

    // Build filename template with sanitized title (max 200 bytes)
    let filenameTemplate = request.filename || "%(title).200B.%(ext)s";
    if (!filenameTemplate.includes("%(ext)s")) {
      filenameTemplate += ".%(ext)s";
    }

    const fullPath = join(outputPath, filenameTemplate);

    const job: DownloadJob = {
      id: jobId,
      url: request.url,
      title,
      type,
      status: "pending",
      progress: { percent: 0 },
      outputPath: fullPath,
      customPath: request.subfolder,
      formatId: request.format_id,
      playlistItems: request.playlistItems,
      playlistItemFormats: request.playlistItemFormats,
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);

    this.saveState();
    this.processQueue();

    return jobId;
  }

  private async processQueue() {
    while (
      this.queue.length > 0 &&
      this.activeDownloads.size < this.MAX_CONCURRENT
    ) {
      const jobId = this.queue.shift();
      if (!jobId) continue;

      const job = this.jobs.get(jobId);
      if (!job || job.status !== "pending") continue;

      this.activeDownloads.add(jobId);
      this.executeDownload(job).finally(() => {
        this.activeDownloads.delete(jobId);
        this.processQueue();
      });
    }
  }

  private async executeDownload(job: DownloadJob) {
    try {
      job.status = "downloading";
      this.saveState();
      this.broadcast(job.id, {
        type: "download-progress",
        payload: {
          jobId: job.id,
          progress: job.progress,
          status: "downloading",
        },
      });

      // Ensure output directory exists
      const outputDir = job.outputPath.substring(
        0,
        job.outputPath.lastIndexOf("/")
      );
      await mkdir(outputDir, { recursive: true });

      // Throttle progress updates - only send every 500ms
      let lastBroadcastTime = 0;
      const BROADCAST_INTERVAL = 500; // ms

      let files: string[];

      // Check if we need to download playlist items with different formats
      if (
        job.playlistItemFormats &&
        Object.keys(job.playlistItemFormats).length > 0
      ) {
        // Download each item separately with its specific format
        files = await this.downloadPlaylistWithPerItemFormats(
          job,
          (progress: DownloadProgress) => {
            job.progress = progress;
            const now = Date.now();
            if (now - lastBroadcastTime >= BROADCAST_INTERVAL) {
              lastBroadcastTime = now;
              this.broadcast(job.id, {
                type: "download-progress",
                payload: { jobId: job.id, progress, status: "downloading" },
              });
            }
          }
        );
      } else {
        // Standard download
        files = await this.ytDlp.download(
          job.url,
          job.outputPath,
          job.formatId,
          job.playlistItems,
          (progress: DownloadProgress) => {
            job.progress = progress;
            const now = Date.now();
            if (now - lastBroadcastTime >= BROADCAST_INTERVAL) {
              lastBroadcastTime = now;
              this.broadcast(job.id, {
                type: "download-progress",
                payload: { jobId: job.id, progress, status: "downloading" },
              });
            }
          },
          job.id
        );
      }

      job.status = "completed";
      job.completedAt = new Date();
      job.files = files;
      job.progress.percent = 100;
      this.saveState();

      this.broadcast(job.id, {
        type: "download-complete",
        payload: { jobId: job.id, files },
      });
    } catch (error) {
      const errorMsg = String(error);
      // Check if error is due to cancellation
      if (errorMsg.includes("cancelled")) {
        job.status = "cancelled";
        this.saveState();
        this.broadcast(job.id, {
          type: "download-cancelled",
          payload: { jobId: job.id },
        });
      } else {
        job.status = "failed";
        job.error = errorMsg;
        this.saveState();
        this.broadcast(job.id, {
          type: "download-error",
          payload: { jobId: job.id, error: job.error },
        });
      }
    }
  }

  private async downloadPlaylistWithPerItemFormats(
    job: DownloadJob,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<string[]> {
    const allFiles: string[] = [];
    const itemsToDownload = job.playlistItems || [];
    const itemFormats = job.playlistItemFormats || {};

    const totalItems = itemsToDownload.length;
    let completedItems = 0;

    for (const itemIndex of itemsToDownload) {
      const formatForItem = itemFormats[itemIndex] || job.formatId;

      // Update progress for playlist tracking
      completedItems++;
      onProgress({
        percent: 0,
        currentVideo: completedItems,
        totalVideos: totalItems,
      });

      try {
        // Download single item with its specific format
        const files = await this.ytDlp.download(
          job.url,
          job.outputPath,
          formatForItem,
          [itemIndex], // Download only this item
          (itemProgress: DownloadProgress) => {
            // Combine item progress with playlist progress
            const overallPercent =
              ((completedItems - 1) / totalItems) * 100 +
              itemProgress.percent / totalItems;
            onProgress({
              ...itemProgress,
              percent: overallPercent,
              currentVideo: completedItems,
              totalVideos: totalItems,
            });
          },
          job.id
        );

        allFiles.push(...files);
      } catch (error) {
        console.error(`Failed to download item ${itemIndex}:`, error);
        // Continue with other items even if one fails
      }
    }

    return allFiles;
  }

  cancelDownload(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === "pending") {
      const index = this.queue.indexOf(jobId);
      if (index > -1) {
        this.queue.splice(index, 1);
      }
      job.status = "cancelled";
      this.saveState();
      this.broadcast(jobId, {
        type: "download-cancelled",
        payload: { jobId },
      });
      return true;
    }

    if (job.status === "downloading") {
      // Kill the active yt-dlp process
      const killed = this.ytDlp.cancelDownload(jobId);
      if (killed) {
        job.status = "cancelled";
        this.saveState();
        this.broadcast(jobId, {
          type: "download-cancelled",
          payload: { jobId },
        });
        return true;
      }
      return false;
    }

    return false;
  }

  getJob(jobId: string): DownloadJob | undefined {
    return this.jobs.get(jobId);
  }

  getAllJobs(): DownloadJob[] {
    return Array.from(this.jobs.values());
  }

  getActiveJobs(): DownloadJob[] {
    return Array.from(this.jobs.values()).filter(
      (job) => job.status === "downloading" || job.status === "pending"
    );
  }

  clearQueue(): void {
    // Cancel all active downloads
    this.activeDownloads.forEach((jobId) => {
      this.cancelDownload(jobId);
    });

    // Clear all jobs and queue
    this.jobs.clear();
    this.queue = [];
    this.activeDownloads.clear();
    this.wsClients.clear();

    this.saveState();
  }

  private generateJobId(): string {
    return `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
