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

  async getMetadata(url: string): Promise<YtDlpMetadataResponse> {
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
      const metadata = JSON.parse(lines[0]!) as
        | VideoMetadata
        | PlaylistMetadata;
      return { rawLog, metadata };
    }

    // Multiple lines means playlist entries - parse the first one as it contains playlist info
    const firstEntry = JSON.parse(lines[0]!);

    // Build playlist metadata from entries
    const entries = lines.map((line) => {
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
  }

  async detectType(url: string): Promise<"video" | "playlist"> {
    const process =
      await $`yt-dlp --no-warnings --skip-download --print-json --flat-playlist "${url}"`;
    const output = new TextDecoder().decode(process.stdout);
    const data = JSON.parse(output);
    return data._type === "playlist" ? "playlist" : "video";
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
    onProgress?: (progress: DownloadProgress) => void
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
      args.push("-f", formatId);
    } else {
      args.push(
        "-f",
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
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

    const files: string[] = [];
    let lastProgress: DownloadProgress = { percent: 0 };

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

              // Track playlist progress
              const playlistMatch = line.match(
                /Downloading item (\d+) of (\d+)/
              );
              if (playlistMatch && playlistMatch[1] && playlistMatch[2]) {
                lastProgress.currentVideo = parseInt(playlistMatch[1]);
                lastProgress.totalVideos = parseInt(playlistMatch[2]);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    };

    await Promise.all([processOutput(proc.stdout), processOutput(proc.stderr)]);

    await proc.exited;

    if (proc.exitCode !== 0) {
      throw new Error(`yt-dlp failed with exit code ${proc.exitCode}`);
    }

    return files;
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
