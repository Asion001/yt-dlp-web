import type { VideoMetadata, VideoFormat } from "@/types";
import { useState } from "react";

export function Metadata(metadata: VideoMetadata) {
  const formats = metadata.formats || [];

  const formatFilesize = (bytes?: number) => {
    if (!bytes) return "Unknown size";
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(1)} MB`;
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
            <FormatTypeGroup key={type} type={type} codecs={codecs} formatFilesize={formatFilesize} />
          ))}
      </div>
    </div>
  );
}

function FormatTypeGroup({ 
  type, 
  codecs, 
  formatFilesize 
}: { 
  type: string; 
  codecs: Record<string, Record<string, VideoFormat[]>>; 
  formatFilesize: (bytes?: number) => string;
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
            <CodecGroup key={codec} codec={codec} resolutions={resolutions} formatFilesize={formatFilesize} />
          ))}
        </div>
      )}
    </div>
  );
}

function CodecGroup({ 
  codec, 
  resolutions, 
  formatFilesize 
}: { 
  codec: string; 
  resolutions: Record<string, VideoFormat[]>; 
  formatFilesize: (bytes?: number) => string;
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
  formatFilesize 
}: { 
  resolution: string; 
  formats: VideoFormat[]; 
  formatFilesize: (bytes?: number) => string;
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
          {formats.map((format) => (
            <div
              key={format.format_id}
              className="bg-[#1a1a1a] rounded p-3 border border-[#fbf0df]/10"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-mono text-[#f3d5a3] font-semibold text-sm">
                    {format.format_id}
                  </span>
                  {format.format_note && (
                    <span className="ml-2 text-xs text-[#fbf0df]/60">
                      {format.format_note}
                    </span>
                  )}
                </div>
                <span className="text-sm text-[#fbf0df]/70">
                  {formatFilesize(format.filesize)}
                </span>
              </div>
              
              <div className="flex gap-3 text-xs text-[#fbf0df]/60">
                <span>📹 {format.ext?.toUpperCase()}</span>
                {format.vcodec && format.vcodec !== "none" && (
                  <span>V: {format.vcodec}</span>
                )}
                {format.acodec && format.acodec !== "none" && (
                  <span>A: {format.acodec}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}