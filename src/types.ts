export interface VideoMetadata {
  title: string;
  duration: number;
  thumbnail: string;
  uploader: string;
  formats: VideoFormat[];
}

export interface VideoFormat {
  format_id: string;
  ext: string;
  filesize?: number;
  resolution: string;
  format_note?: string;
  vcodec: string;
  acodec: string;
}

export interface YtDlpMetadataResponse {
  rawLog: string;
  metadata?: VideoMetadata;
}
