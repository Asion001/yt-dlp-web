import type { VideoMetadata, VideoFormat, FormatRecommendation } from "@/types";
import { useState } from "react";
import toast from "react-hot-toast";

interface MetadataProps {
  metadata: VideoMetadata;
  recommendation?: FormatRecommendation | null;
  onDownload: (formatId?: string) => void;
}

export function Metadata({ metadata, recommendation, onDownload }: MetadataProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const formats = metadata.formats || [];

  const handleDownload = (formatId?: string) => {
    setIsDownloading(true);
    toast.success(`Download request sent${formatId ? ` (format: ${formatId})` : ''}`, { duration: 3000 });
    onDownload(formatId);
    // Re-enable after 2 seconds to allow multiple downloads
    setTimeout(() => setIsDownloading(false), 2000);
  };

  const formatFilesize = (bytes?: number, approx?: number) => {
    const size = bytes || approx;
    if (!size) return "Unknown size";
    const mb = size / (1024 * 1024);
    const prefix = approx && !bytes ? "~" : "";
    return mb < 1 ? `${prefix}${(size / 1024).toFixed(1)} KB` : `${prefix}${mb.toFixed(1)} MB`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "Unknown";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Group formats by type -> codec -> resolution
  const groupedFormats = formats.reduce((acc, format) => {
    const isVideo = format.vcodec && format.vcodec !== "none";
    const type = isVideo ? "video" : "audio";
    let codec = (isVideo ? format.vcodec.split(".")[0]?.toString() 
    : format.acodec.split(".")[0]?.toString() ) ?? "unknown";
    const resolution = format.resolution || "audio only";

    if (!acc[type]) acc[type] = {};
    if (!acc[type][codec]) acc[type][codec] = {};
    if (!acc[type][codec][resolution]) acc[type][codec][resolution] = [];
    
    acc[type][codec][resolution].push(format);
    return acc;
  }, {} as Record<string, Record<string, Record<string, VideoFormat[]>>>);

  return (
    <div className="w-full bg-[#1a1a1a] border-2 border-[#fbf0df] rounded-xl p-6 text-[#fbf0df]">
      {/* Video Info Header */}
      <div className="mb-6 pb-4 border-b border-[#fbf0df]/20">
        <h2 className="text-xl font-bold text-white mb-2">{metadata.title}</h2>
        <div className="flex gap-4 text-sm text-[#fbf0df]/70">
          <span>👤 {metadata.uploader}</span>
          <span>⏱️ {formatDuration(metadata.duration)}</span>
          <span>📦 {formats.length} formats</span>
        </div>
        
        {/* Quick Download Best Quality */}
        <div className="mt-4">
          {recommendation && (
            <button
              onClick={() => handleDownload(recommendation.format_id)}
              disabled={isDownloading}
              className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⭐ Download Recommended ({recommendation.format_id})
            </button>
          )}
          {recommendation && (
            <p className="text-xs text-green-400 mt-2">
              💡 {recommendation.reason}
            </p>
          )}
        </div>
      </div>

      {/* Thumbnail */}
      {metadata.thumbnail && (
        <img
          src={metadata.thumbnail}
          alt={metadata.title}
          className="w-full max-w-md rounded-lg mb-6 border border-[#fbf0df]/20"
        />
      )}

      {/* Formats List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white mb-3">Available Formats</h3>
        
        {Object.entries(groupedFormats)
          .sort(([typeA], [typeB]) => typeA === "video" ? -1 : 1) // video first
          .map(([type, codecs]) => (
            <FormatTypeGroup 
              key={type} 
              type={type} 
              codecs={codecs} 
              formatFilesize={formatFilesize}
              onDownload={handleDownload}
              recommendedFormatId={recommendation?.format_id}
              isDownloading={isDownloading}
            />
          ))}
      </div>
    </div>
  );
}

function FormatTypeGroup({ 
  type, 
  codecs, 
  formatFilesize,
  onDownload,
  recommendedFormatId,
  isDownloading
}: { 
  type: string; 
  codecs: Record<string, Record<string, VideoFormat[]>>; 
  formatFilesize: (bytes?: number, approx?: number) => string;
  onDownload: (formatId?: string) => void;
  recommendedFormatId?: string;
  isDownloading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);

  // Codec priority order
  const videoCodecOrder = ["av01", "vp9", "avc1", "h264"];
  const audioCodecOrder = ["opus", "mp4a", "mp3"];
  const codecOrder = type === "video" ? videoCodecOrder : audioCodecOrder;

  const sortedCodecs = Object.entries(codecs).sort(([codecA], [codecB]) => {
    const indexA = codecOrder.indexOf(codecA);
    const indexB = codecOrder.indexOf(codecB);
    
    // If both found, sort by order
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    // If only A found, A comes first
    if (indexA !== -1) return -1;
    // If only B found, B comes first
    if (indexB !== -1) return 1;
    // Neither found, alphabetical
    return codecA.localeCompare(codecB);
  });

  return (
    <div className="border border-[#fbf0df]/20 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-[#0d0d0d] hover:bg-[#151515] transition-colors"
      >
        <span className="font-semibold text-white uppercase">
          {type === "video" ? "📹 Video" : "🎵 Audio"}
        </span>
        <span className="text-[#fbf0df]/60">{isOpen ? "▼" : "▶"}</span>
      </button>
      
      {isOpen && (
        <div className="p-2 space-y-2">
          {sortedCodecs.map(([codec, resolutions]) => (
            <CodecGroup 
              key={codec} 
              codec={codec} 
              resolutions={resolutions} 
              formatFilesize={formatFilesize}
              onDownload={onDownload}
              recommendedFormatId={recommendedFormatId}
              isDownloading={isDownloading}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CodecGroup({ 
  codec, 
  resolutions, 
  formatFilesize,
  onDownload,
  recommendedFormatId,
  isDownloading
}: { 
  codec: string; 
  resolutions: Record<string, VideoFormat[]>; 
  formatFilesize: (bytes?: number, approx?: number) => string;
  onDownload: (formatId?: string) => void;
  recommendedFormatId?: string;
  isDownloading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Sort resolutions by quality (higher first)
  const sortedResolutions = Object.entries(resolutions).sort(([resA], [resB]) => {
    // Extract height from resolution (e.g., "1920x1080" -> 1080)
    const heightA = resA === "audio only" ? 0 : parseInt(resA.split("x")[1] || "0");
    const heightB = resB === "audio only" ? 0 : parseInt(resB.split("x")[1] || "0");
    return heightB - heightA; // higher first
  });

  return (
    <div className="border border-[#fbf0df]/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-[#1a1a1a] hover:bg-[#0d0d0d] transition-colors"
      >
        <span className="font-mono text-[#f3d5a3]">{codec}</span>
        <span className="text-[#fbf0df]/60 text-sm">{isOpen ? "▼" : "▶"}</span>
      </button>
      
      {isOpen && (
        <div className="p-2 space-y-2">
          {sortedResolutions.map(([resolution, formats]) => (
            <ResolutionGroup 
              key={resolution} 
              resolution={resolution} 
              formats={formats} 
              formatFilesize={formatFilesize}
              onDownload={onDownload}
              recommendedFormatId={recommendedFormatId}
              isDownloading={isDownloading}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResolutionGroup({ 
  resolution, 
  formats, 
  formatFilesize,
  onDownload,
  recommendedFormatId,
  isDownloading
}: { 
  resolution: string; 
  formats: VideoFormat[]; 
  formatFilesize: (bytes?: number, approx?: number) => string;
  onDownload: (formatId?: string) => void;
  recommendedFormatId?: string;
  isDownloading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-[#fbf0df]/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-[#1a1a1a] hover:bg-[#252525] transition-colors"
      >
        <span className="text-white">{resolution}</span>
        <div className="flex items-center gap-2">
          <span className="text-[#fbf0df]/60 text-sm">{formats.length} format(s)</span>
          <span className="text-[#fbf0df]/60 text-sm">{isOpen ? "▼" : "▶"}</span>
        </div>
      </button>
      
      {isOpen && (
        <div className="p-2 space-y-2 bg-[#0d0d0d]">
          {formats.map((format) => {
            const isRecommended = format.format_id === recommendedFormatId;
            return (
              <div
                key={format.format_id}
                className={`rounded p-3 border ${
                  isRecommended 
                    ? "bg-green-900/20 border-green-500/50" 
                    : "bg-[#1a1a1a] border-[#fbf0df]/10"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[#f3d5a3] font-semibold text-sm">
                        {format.format_id}
                      </span>
                      {isRecommended && (
                        <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded font-bold">
                          ⭐ RECOMMENDED
                        </span>
                      )}
                    </div>
                    {format.format_note && (
                      <span className="text-xs text-[#fbf0df]/60 block mt-1">
                        {format.format_note}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-[#fbf0df]/70 mb-1">
                      {formatFilesize(format.filesize, format.filesize_approx)}
                    </div>
                    <button
                      onClick={() => onDownload(format.format_id)}
                      disabled={isDownloading}
                      className="text-xs bg-[#fbf0df] text-[#1a1a1a] px-3 py-1 rounded hover:bg-[#f3d5a3] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Download
                    </button>
                  </div>
                </div>
                
                <div className="flex gap-3 text-xs text-[#fbf0df]/60">
                  <span>📹 {format.ext?.toUpperCase()}</span>
                  {format.vcodec && format.vcodec !== "none" && (
                    <span>V: {format.vcodec}</span>
                  )}
                  {format.acodec && format.acodec !== "none" && (
                    <span>A: {format.acodec}</span>
                  )}
                  {format.fps && <span>{format.fps}fps</span>}
                  {format.tbr && <span>{format.tbr.toFixed(0)}k</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}