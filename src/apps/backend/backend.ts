import { DownloadQueueManager } from "./download-queue";
import type { WSMessage, DownloadRequest } from "../../types";

export { apiRoutes } from "./routes";

// Initialize download queue manager with download directory from env
const downloadDir = process.env.DOWNLOAD_DIR || "~/Downloads/yt-dlp-web";
export const downloadQueue = new DownloadQueueManager(downloadDir);

// WebSocket handler for download progress
export const websocketHandler = {
  open(ws: any) {
    console.log("WebSocket client connected");
  },

  message(ws: any, message: string) {
    try {
      let msg: WSMessage;
      try {
        msg = JSON.parse(message);
      } catch (parseError) {
        console.error("Failed to parse WebSocket message:", parseError);
        console.error(
          "Message content (first 200 chars):",
          message.substring(0, 200)
        );
        ws.send(
          JSON.stringify({
            type: "error",
            payload: { error: `Invalid JSON message: ${parseError}` },
          })
        );
        return;
      }

      switch (msg.type) {
        case "download-request":
          handleDownloadRequest(ws, msg.payload);
          break;

        case "subscribe":
          if (msg.payload?.jobId) {
            downloadQueue.subscribeToJob(msg.payload.jobId, ws);
          }
          break;

        case "download-cancel":
          if (msg.payload?.jobId) {
            const success = downloadQueue.cancelDownload(msg.payload.jobId);
            ws.send(
              JSON.stringify({
                type: "download-cancelled",
                payload: { jobId: msg.payload.jobId, success },
              })
            );
          }
          break;

        case "queue-status":
          const jobs = downloadQueue.getAllJobs();
          // Serialize jobs properly - convert dates to ISO strings explicitly
          const serializedJobs = jobs.map((job) => ({
            ...job,
            createdAt:
              job.createdAt instanceof Date
                ? job.createdAt.toISOString()
                : job.createdAt,
            completedAt:
              job.completedAt instanceof Date
                ? job.completedAt.toISOString()
                : job.completedAt,
          }));
          ws.send(
            JSON.stringify({
              type: "queue-status",
              payload: { jobs: serializedJobs },
            })
          );
          break;

        case "clear-queue":
          downloadQueue.clearQueue();
          ws.send(
            JSON.stringify({
              type: "queue-cleared",
              payload: {},
            })
          );
          break;
      }
    } catch (error) {
      console.error("WebSocket message error:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          payload: { error: String(error) },
        })
      );
    }
  },

  close(ws: any) {
    console.log("WebSocket client disconnected");
    // Clean up subscriptions
    const jobs = downloadQueue.getAllJobs();
    jobs.forEach((job) => downloadQueue.unsubscribeFromJob(job.id, ws));
  },
};

async function handleDownloadRequest(ws: any, request: DownloadRequest) {
  try {
    const jobId = await downloadQueue.addDownload(request);
    downloadQueue.subscribeToJob(jobId, ws);

    ws.send(
      JSON.stringify({
        type: "download-started",
        payload: { jobId },
      })
    );
  } catch (error) {
    ws.send(
      JSON.stringify({
        type: "download-error",
        payload: { error: String(error) },
      })
    );
  }
}
