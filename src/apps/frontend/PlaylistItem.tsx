import type { PlaylistEntry } from "@/types";
import { useState } from "react";

interface PlaylistItemProps {
  entry: PlaylistEntry;
  index: number;
  isSelected: boolean;
  onToggle: () => void;
  selectedFormat?: string;
  onFormatChange: (formatId?: string) => void;
}

const FORMAT_OPTIONS = [
  { value: "", label: "Auto (Best Quality)" },
  { value: "bestvideo[height<=480]+bestaudio/best[height<=480]", label: "480p" },
  { value: "bestvideo[height<=720]+bestaudio/best[height<=720]", label: "720p" },
  { value: "bestvideo[height<=1080]+bestaudio/best[height<=1080]", label: "1080p" },
  { value: "bestvideo[height<=1440]+bestaudio/best[height<=1440]", label: "1440p" },
  { value: "bestvideo[height<=2160]+bestaudio/best[height<=2160]", label: "4K (2160p)" },
  { value: "bestaudio/best", label: "Audio Only" },
];

export function PlaylistItem({
  entry,
  index,
  isSelected,
  onToggle,
  selectedFormat,
  onFormatChange,
}: PlaylistItemProps) {
  const [showFormats, setShowFormats] = useState(false);

  const duration = entry.duration
    ? `${Math.floor(entry.duration / 60)}:${String(entry.duration % 60).padStart(2, "0")}`
    : null;

  const currentFormatLabel = FORMAT_OPTIONS.find(opt => opt.value === selectedFormat)?.label || "Auto";

  return (
    <div
      className={`rounded-lg border transition-all ${
        isSelected
          ? "bg-[#fbf0df]/10 border-[#fbf0df] shadow-sm"
          : "bg-[#0d0d0d] border-[#fbf0df]/20 hover:bg-[#1a1a1a] hover:border-[#fbf0df]/40"
      }`}
    >
      <label className="flex gap-3 p-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="w-5 h-5 mt-1 flex-shrink-0 cursor-pointer accent-[#fbf0df]"
        />

        {entry.thumbnail && (
          <div className="relative flex-shrink-0 w-32 h-18 rounded overflow-hidden bg-[#252525]">
            <img
              src={entry.thumbnail}
              alt={entry.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {duration && (
              <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded font-mono">
                {duration}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <span className="text-[#fbf0df]/50 text-sm font-mono flex-shrink-0 mt-0.5">
              {index}.
            </span>
            <div className="flex-1 min-w-0">
              <h4
                className={`text-sm font-medium leading-snug mb-1 ${
                  isSelected ? "text-white" : "text-[#fbf0df]"
                }`}
              >
                {entry.title}
              </h4>
              {entry.uploader && (
                <p className="text-xs text-[#fbf0df]/50">{entry.uploader}</p>
              )}
            </div>
          </div>
        </div>

        {isSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowFormats(!showFormats);
            }}
            className="flex-shrink-0 text-xs bg-[#fbf0df]/10 text-[#fbf0df] border border-[#fbf0df]/30 px-3 py-1.5 rounded hover:bg-[#fbf0df]/20 transition-colors self-start"
          >
            {currentFormatLabel}
          </button>
        )}
      </label>

      {/* Format Selection Dropdown */}
      {isSelected && showFormats && (
        <div className="px-3 pb-3 pt-0">
          <div className="bg-[#0d0d0d] border border-[#fbf0df]/20 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-semibold text-white">Select Quality</h5>
              <button
                type="button"
                onClick={() => setShowFormats(false)}
                className="text-[#fbf0df]/60 hover:text-[#fbf0df] text-xs"
              >
                ✕
              </button>
            </div>

            {FORMAT_OPTIONS.map((option) => {
              const isCurrentFormat = (option.value === "" && !selectedFormat) || 
                                     selectedFormat === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFormatChange(option.value || undefined);
                    setShowFormats(false);
                  }}
                  className={`w-full text-left rounded p-2 transition-colors ${
                    isCurrentFormat
                      ? "bg-[#fbf0df]/20 border border-[#fbf0df]"
                      : "bg-[#1a1a1a] border border-[#fbf0df]/20 hover:bg-[#252525]"
                  }`}
                >
                  <span className="text-xs text-[#fbf0df]">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
