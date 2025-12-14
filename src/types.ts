export interface VideoMetadata {
  _type?: "video";
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  uploader: string;
  uploader_id?: string;
  formats: VideoFormat[];
  url?: string;
  webpage_url?: string;
  playlist?: string;
  playlist_id?: string;
  playlist_index?: number;
  playlist_count?: number;
}

export interface VideoFormat {
  format_id: string;
  ext: string;
  filesize?: number;
  filesize_approx?: number;
  resolution: string;
  format_note?: string;
  vcodec: string;
  acodec: string;
  fps?: number;
  tbr?: number;
  vbr?: number;
  abr?: number;
  width?: number;
  height?: number;
}

export interface PlaylistMetadata {
  _type: "playlist";
  id: string;
  title: string;
  uploader?: string;
  uploader_id?: string;
  entries: PlaylistEntry[];
  playlist_count: number;
  webpage_url: string;
}

export interface PlaylistEntry {
  id: string;
  title: string;
  url: string;
  duration?: number;
  thumbnail?: string;
  uploader?: string;
  playlist_index?: number;
  formats?: VideoFormat[];
  recommendation?: FormatRecommendation;
}

export interface YtDlpMetadataResponse {
  rawLog: string;
  metadata?: VideoMetadata | PlaylistMetadata;
}

export interface FormatRecommendation {
  format_id: string;
  reason: string;
  score: number;
}

export interface DownloadRequest {
  url: string;
  format_id?: string;
  subfolder?: string;
  filename?: string;
  playlistItems?: number[];
  playlistItemFormats?: Record<number, string>; // Map of playlist_index -> format_id
}

export interface DownloadJob {
  id: string;
  url: string;
  type: "video" | "playlist";
  status: "pending" | "downloading" | "completed" | "failed" | "cancelled";
  progress: DownloadProgress;
  outputPath: string;
  customPath?: string;
  formatId?: string;
  playlistItems?: number[];
  playlistItemFormats?: Record<number, string>; // Map of playlist_index -> format_id
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  files?: string[];
}

export interface DownloadProgress {
  percent: number;
  speed?: string;
  eta?: string;
  currentVideo?: number;
  totalVideos?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  currentFile?: string;
}

export type WSMessageType =
  | "download-request"
  | "download-progress"
  | "download-complete"
  | "download-error"
  | "download-cancel"
  | "subscribe"
  | "queue-status"
  | "clear-queue"
  | "queue-cleared";

export interface WSMessage {
  type: WSMessageType;
  payload: any;
}

export interface WSDownloadRequest {
  type: "download-request";
  payload: DownloadRequest;
}

export interface WSDownloadProgress {
  type: "download-progress";
  payload: {
    jobId: string;
    progress: DownloadProgress;
  };
}

export interface WSDownloadComplete {
  type: "download-complete";
  payload: {
    jobId: string;
    files: string[];
  };
}

export interface WSDownloadError {
  type: "download-error";
  payload: {
    jobId: string;
    error: string;
  };
}

export interface WSQueueStatus {
  type: "queue-status";
  payload: {
    jobs: DownloadJob[];
  };
}
