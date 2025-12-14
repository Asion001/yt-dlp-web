import type { BunRequest, Serve } from "bun";
import { YtDlpCli } from "./yt-dlp-cli";
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

        return Response.json(result);
      } catch (error) {
        return Response.json({ error: String(error) }, { status: 500 });
      }
    },
  },
};

// Automatically prefix all routes with "/api"
const apiRoutes = Object.fromEntries(
  Object.entries(_apiRoutes).map(([path, handler]) => [`/api${path}`, handler])
);
