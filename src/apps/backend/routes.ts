import type { BunRequest, Serve } from "bun";
import { YtDlpCli } from "./yt-dlp-cli";
import { downloadQueue } from "./backend";
import { resolve } from "path";
import { stat } from "fs/promises";

type RouteHandler = (req: BunRequest) => Promise<Response> | Response;
type RouteHandlers = Record<string, RouteHandler>;

export { apiRoutes };

// Create an instance of the service
const ytDlpService = new YtDlpCli();

const _apiRoutes = {
  "/link/metadata": {
    async GET(req: BunRequest) {
      try {
        // Get the URL from query parameters
        const url = new URL(req.url);
        const videoUrl = url.searchParams.get("url");

        if (!videoUrl) {
          return Response.json(
            { error: "Missing 'url' parameter" },
            { status: 400 }
          );
        }

        // Use the service to get metadata
        const result = await ytDlpService.getMetadata(videoUrl);

        // Add format recommendation if it's a video
        if (result.metadata && result.metadata._type !== "playlist") {
          const recommendation = ytDlpService.recommendFormat(
            result.metadata.formats
          );
          (result as any).recommendation = recommendation;
        }

        return Response.json(result);
      } catch (error) {
        return Response.json({ error: String(error) }, { status: 500 });
      }
    },
  },

  "/download": {
    async POST(req: BunRequest) {
      try {
        const body = await req.json();

        if (!body.url) {
          return Response.json(
            { error: "Missing 'url' in request body" },
            { status: 400 }
          );
        }

        const jobId = await downloadQueue.addDownload(body);

        return Response.json({ jobId, status: "queued" });
      } catch (error) {
        return Response.json({ error: String(error) }, { status: 500 });
      }
    },
  },

  "/download/:id": {
    async GET(req: BunRequest) {
      try {
        const url = new URL(req.url);
        const id = url.pathname.split("/").pop();

        if (!id) {
          return Response.json({ error: "Missing job ID" }, { status: 400 });
        }

        const job = downloadQueue.getJob(id);

        if (!job) {
          return Response.json({ error: "Job not found" }, { status: 404 });
        }

        return Response.json(job);
      } catch (error) {
        return Response.json({ error: String(error) }, { status: 500 });
      }
    },

    async DELETE(req: BunRequest) {
      try {
        const url = new URL(req.url);
        const id = url.pathname.split("/").pop();

        if (!id) {
          return Response.json({ error: "Missing job ID" }, { status: 400 });
        }

        const success = downloadQueue.cancelDownload(id);

        return Response.json({ success });
      } catch (error) {
        return Response.json({ error: String(error) }, { status: 500 });
      }
    },
  },

  "/downloads": {
    async GET(req: BunRequest) {
      try {
        const jobs = downloadQueue.getAllJobs();
        return Response.json({ jobs });
      } catch (error) {
        return Response.json({ error: String(error) }, { status: 500 });
      }
    },
  },

  "/files": {
    async GET(req: BunRequest) {
      try {
        const url = new URL(req.url);
        const filenamePart = url.searchParams.get("file");
        const filename = filenamePart ? decodeURIComponent(filenamePart) : "";

        if (!filename) {
          return Response.json({ error: "Missing filename" }, { status: 400 });
        }

        const downloadDir =
          process.env.DOWNLOAD_DIR || "~/Downloads/yt-dlp-web";
        const filePath = resolve(
          downloadDir.replace(/^~/, process.env.HOME || ""),
          filename
        );

        // Security check: ensure file is within download directory
        const normalizedDownloadDir = resolve(
          downloadDir.replace(/^~/, process.env.HOME || "")
        );
        if (!filePath.startsWith(normalizedDownloadDir)) {
          return Response.json({ error: "Access denied" }, { status: 403 });
        }

        try {
          const fileStats = await stat(filePath);
          if (!fileStats.isFile()) {
            return Response.json({ error: "Not a file" }, { status: 400 });
          }

          const file = Bun.file(filePath);
          return new Response(file, {
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
          });
        } catch (err) {
          console.error("File access error:", err);
          return Response.json({ error: "File not found" }, { status: 404 });
        }
      } catch (error) {
        return Response.json({ error: String(error) }, { status: 500 });
      }
    },
  },
};

// Automatically prefix all routes with "/api"
const apiRoutes: Record<string, RouteHandlers> = Object.fromEntries(
  Object.entries(_apiRoutes).map(([path, handler]) => [`/api${path}`, handler])
) as Record<string, RouteHandlers>;
