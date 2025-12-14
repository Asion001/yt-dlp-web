import { $ } from "bun";
import { basename } from "path";
import type {
  VideoMetadata,
  PlaylistMetadata,
  YtDlpMetadataResponse,
  FormatRecommendation,
  VideoFormat,
  DownloadProgress,
} from "../../types";

export class YtDlpCli {
  private speedHistory: number[] = [];
  private readonly SPEED_HISTORY_SIZE = 5;
  private activeProcesses: Map<string, any> = new Map();

  async getMetadata(url: string): Promise<YtDlpMetadataResponse> {
    try {
      const process =
        await $`yt-dlp --no-warnings --skip-download --print-json --flat-playlist "${url}"`;
      let rawLog = "";

      rawLog += new TextDecoder().decode(process.stdout);
      rawLog += new TextDecoder().decode(process.stderr);

      const stdout = new TextDecoder().decode(process.stdout).trim();

      // Handle newline-delimited JSON (multiple objects for playlists)
      const lines = stdout.split("\n").filter((line) => line.trim());

      if (lines.length === 0) {
        throw new Error("No metadata received from yt-dlp");
      }

      // If there's only one line, parse it as a single video/playlist
      if (lines.length === 1) {
        try {
          const metadata = JSON.parse(lines[0]!) as
            | VideoMetadata
            | PlaylistMetadata;
          return { rawLog, metadata };
        } catch (parseError) {
          throw new Error(
            `Failed to parse metadata: ${lines[0]?.substring(
              0,
              100
            )}... - ${parseError}`
          );
        }
      }

      // Multiple lines means playlist entries - parse the first one as it contains playlist info
      let firstEntry: any;
      try {
        firstEntry = JSON.parse(lines[0]!);
      } catch (parseError) {
        throw new Error(
          `Failed to parse first playlist entry: ${lines[0]?.substring(
            0,
            100
          )}... - ${parseError}`
        );
      }

      // Build playlist metadata from entries
      const entries = lines.map((line, index) => {
        try {
          const entry = JSON.parse(line);
          return {
            id: entry.id,
            title: entry.title || "[Untitled]",
            url:
              entry.url ||
              entry.webpage_url ||
              `https://www.youtube.com/watch?v=${entry.id}`,
            duration: entry.duration,
            thumbnail:
              entry.thumbnails?.[entry.thumbnails.length - 1]?.url ||
              entry.thumbnail,
            uploader: entry.uploader || entry.channel,
            playlist_index: entry.playlist_index,
          };
        } catch (parseError) {
          console.error(
            `Failed to parse playlist entry ${index + 1}:`,
            line.substring(0, 100),
            parseError
          );
          // Return a placeholder entry instead of failing completely
          return {
            id: `unknown_${index}`,
            title: `[Parse Error] Entry ${index + 1}`,
            url: url,
            playlist_index: index + 1,
          };
        }
      });
      const metadata: PlaylistMetadata = {
        _type: "playlist",
        id: firstEntry.playlist_id || firstEntry.id,
        title: firstEntry.playlist_title || firstEntry.playlist || "Playlist",
        uploader: firstEntry.playlist_uploader || firstEntry.uploader,
        entries: entries,
        webpage_url: firstEntry.playlist_webpage_url || url,
        playlist_count: entries.length,
      };

      return { rawLog, metadata };
    } catch (error) {
      console.error("getMetadata error:", error);
      throw error;
    }
  }

  async detectType(url: string): Promise<"video" | "playlist"> {
    try {
      const process =
        await $`yt-dlp --no-warnings --skip-download --print-json --flat-playlist "${url}"`;
      const output = new TextDecoder().decode(process.stdout).trim();

      if (!output) {
        throw new Error("No output from yt-dlp");
      }

      // Parse first line only
      const firstLine = output.split("\n")[0];
      const data = JSON.parse(firstLine!);
      return data._type === "playlist" ? "playlist" : "video";
    } catch (error) {
      console.error("detectType error:", error);
      // Default to video if detection fails
      return "video";
    }
  }

  recommendFormat(formats: VideoFormat[]): FormatRecommendation | null {
    if (!formats || formats.length === 0) return null;

    const scoredFormats = formats.map((format) => {
      let score = 0;

      // Prefer formats with both video and audio
      const hasVideo = format.vcodec && format.vcodec !== "none";
      const hasAudio = format.acodec && format.acodec !== "none";
      if (hasVideo && hasAudio) score += 50;

      // Prefer modern codecs
      if (format.vcodec?.startsWith("av01")) score += 30;
      else if (format.vcodec?.startsWith("vp9")) score += 20;
      else if (format.vcodec?.startsWith("avc1")) score += 10;

      // Resolution scoring
      if (format.height) {
        if (format.height >= 2160) score += 40;
        else if (format.height >= 1440) score += 35;
        else if (format.height >= 1080) score += 30;
        else if (format.height >= 720) score += 20;
        else if (format.height >= 480) score += 10;
      }

      // Prefer higher bitrates
      if (format.tbr) score += Math.min(format.tbr / 100, 20);

      return { format, score };
    });

    scoredFormats.sort((a, b) => b.score - a.score);
    const best = scoredFormats[0];

    if (!best) return null;

    let reason = "Best quality";
    if (best.format.vcodec?.startsWith("av01")) reason += " (AV1 codec)";
    else if (best.format.vcodec?.startsWith("vp9")) reason += " (VP9 codec)";
    if (best.format.height) reason += ` - ${best.format.height}p`;

    return {
      format_id: best.format.format_id,
      reason,
      score: best.score,
    };
  }

  async download(
    url: string,
    outputPath: string,
    formatId?: string,
    playlistItems?: number[],
    onProgress?: (progress: DownloadProgress) => void,
    downloadId?: string
  ): Promise<string[]> {
    const args = [
      "yt-dlp",
      "--no-warnings",
      "--newline",
      "--restrict-filenames",
      "-o",
      outputPath,
    ];

    if (formatId) {
      // If a specific format is selected, ensure we get audio too
      // Format strings like "bestvideo+bestaudio" already have audio
      // But format IDs like "137" or "207" are video-only, so append +bestaudio
      if (/^\d+$/.test(formatId)) {
        // Pure numeric format ID - likely video-only, add best audio
        args.push("-f", `${formatId}+bestaudio/best`);
      } else {
        // Already a format string (contains operators like +, /, etc.)
        args.push("-f", formatId);
      }
    } else {
      args.push(
        "-f",
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"
      );
    }

    if (playlistItems && playlistItems.length > 0) {
      args.push("--playlist-items", playlistItems.join(","));
    }

    args.push(url);

    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });

    // Store process reference for cancellation
    if (downloadId) {
      this.activeProcesses.set(downloadId, proc);
    }

    const files: string[] = [];
    let lastProgress: DownloadProgress = { percent: 0 };
    let wasCancelled = false;

    // Reset speed history for new download
    this.speedHistory = [];

    const decoder = new TextDecoder();

    // Process stdout line by line
    const processOutput = async (stream: ReadableStream) => {
      const reader = stream.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.includes("[download]")) {
              const progress = this.parseProgress(line);
              if (progress && onProgress) {
                lastProgress = { ...lastProgress, ...progress };
                onProgress(lastProgress);
              }

              // Extract filename from destination line
              if (line.includes("Destination:")) {
                const match = line.match(/Destination:\s+(.+)$/);
                if (match && match[1]) {
                  // Store only the basename to avoid path duplication when serving
                  const fullPath = match[1].trim();
                  files.push(basename(fullPath));
                }
              }

              // Track playlist progress - multiple patterns for different yt-dlp versions
              const playlistMatch = line.match(
                /Downloading (?:item|video) (\d+) of (\d+)/
              );
              if (playlistMatch && playlistMatch[1] && playlistMatch[2]) {
                const currentVideo = parseInt(playlistMatch[1]);
                const totalVideos = parseInt(playlistMatch[2]);
                lastProgress.currentVideo = currentVideo;
                lastProgress.totalVideos = totalVideos;
                if (onProgress) {
                  onProgress(lastProgress);
                }
              }

              // Also check for [download] N of M pattern
              const playlistMatch2 = line.match(
                /\[download\]\s+(\d+)\s+of\s+(\d+)/
              );
              if (playlistMatch2 && playlistMatch2[1] && playlistMatch2[2]) {
                const currentVideo = parseInt(playlistMatch2[1]);
                const totalVideos = parseInt(playlistMatch2[2]);
                lastProgress.currentVideo = currentVideo;
                lastProgress.totalVideos = totalVideos;
                if (onProgress) {
                  onProgress(lastProgress);
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    };

    try {
      await Promise.all([
        processOutput(proc.stdout),
        processOutput(proc.stderr),
      ]);

      await proc.exited;

      if (proc.exitCode !== 0 && !wasCancelled) {
        throw new Error(`yt-dlp failed with exit code ${proc.exitCode}`);
      }
    } finally {
      // Clean up process reference
      if (downloadId) {
        this.activeProcesses.delete(downloadId);
      }
    }

    if (wasCancelled) {
      throw new Error("Download was cancelled");
    }

    return files;
  }

  cancelDownload(downloadId: string): boolean {
    const proc = this.activeProcesses.get(downloadId);
    if (proc) {
      try {
        proc.kill();
        this.activeProcesses.delete(downloadId);
        return true;
      } catch (error) {
        console.error("Failed to kill process:", error);
        return false;
      }
    }
    return false;
  }

  private parseProgress(line: string): Partial<DownloadProgress> | null {
    // Parse: [download]  45.2% of 123.45MiB at 1.23MiB/s ETA 00:12
    const percentMatch = line.match(/(\d+\.?\d*)%/);
    const speedMatch = line.match(/at\s+([\d.]+)(\w+\/s)/);
    const etaMatch = line.match(/ETA\s+([\d:]+)/);
    const sizeMatch = line.match(/of\s+([\d.]+\w+)/);

    if (!percentMatch || !percentMatch[1]) return null;

    const progress: Partial<DownloadProgress> = {
      percent: parseFloat(percentMatch[1]),
    };

    // Smooth speed values using moving average
    if (speedMatch && speedMatch[1] && speedMatch[2]) {
      const rawSpeed = parseFloat(speedMatch[1]);
      const unit = speedMatch[2];

      this.speedHistory.push(rawSpeed);
      if (this.speedHistory.length > this.SPEED_HISTORY_SIZE) {
        this.speedHistory.shift();
      }

      // Calculate average speed
      const avgSpeed =
        this.speedHistory.reduce((a, b) => a + b, 0) / this.speedHistory.length;
      progress.speed = `${avgSpeed.toFixed(2)}${unit}`;
    }

    if (etaMatch) progress.eta = etaMatch[1];

    return progress;
  }
}
