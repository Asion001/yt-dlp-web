import type { 
  VideoMetadata, 
  PlaylistMetadata,
  YtDlpMetadataResponse, 
  DownloadJob,
  FormatRecommendation 
} from "@/types";
import { useRef, useState, useEffect, type FormEvent } from "react";
import toast from "react-hot-toast";
import { Metadata } from "./Metadata";
import { PlaylistItem } from "./PlaylistItem";

export function LinkFetch() {
  const responseInputRef = useRef<HTMLTextAreaElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [metadata, setMetadata] = useState<VideoMetadata | PlaylistMetadata | null>(null);
  const [recommendation, setRecommendation] = useState<FormatRecommendation | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [downloads, setDownloads] = useState<Map<string, DownloadJob>>(new Map());
  const [subfolder, setSubfolder] = useState("");
  const [filename, setFilename] = useState("%(title).200B.%(ext)s");
  const [selectedPlaylistItems, setSelectedPlaylistItems] = useState<number[]>([]);
  const [playlistItemFormats, setPlaylistItemFormats] = useState<Record<number, string>>({});
  const [globalPlaylistFormat, setGlobalPlaylistFormat] = useState<string | undefined>(undefined);
  const [showLogs, setShowLogs] = useState(false);
  const lastDownloadUrlRef = useRef<string>("");


  // Initialize WebSocket
  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${location.host}`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log("WebSocket connected");
      // Request queue status
      websocket.send(JSON.stringify({ type: "queue-status", payload: {} }));
    };

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    websocket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    websocket.onclose = () => {
      console.log("WebSocket disconnected");
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        location.reload();
      }, 3000);
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, []);

  const handleWebSocketMessage = (message: any) => {
    switch (message.type) {
      case "download-started":
        console.log("Download started:", message.payload.jobId);
        toast.success("Download started!");
        // Replace temp job with real job ID
        setDownloads((prev) => {
          const newMap = new Map(prev);
          // Remove temp jobs and add the real one
          Array.from(newMap.keys()).forEach(key => {
            if (key.endsWith('_pending')) {
              newMap.delete(key);
            }
          });
          newMap.set(message.payload.jobId, {
            id: message.payload.jobId,
            url: lastDownloadUrlRef.current,
            type: "video",
            status: "pending",
            progress: {
              percent: 0,
            },
            outputPath: "",
            createdAt: new Date(),
          });
          return newMap;
        });
        break;

      case "download-progress":
        console.log("Progress update:", message.payload);
        setDownloads((prev) => {
          const newMap = new Map(prev);
          const jobId = message.payload.jobId;
          const existingJob = newMap.get(jobId);
          if (existingJob) {
            const updatedJob = {
              ...existingJob,
              progress: { ...existingJob.progress, ...message.payload.progress },
              status: message.payload.status || existingJob.status,
            };
            
            // Log detailed progress info
            console.log(`[${jobId}] Status: ${updatedJob.status}, Progress: ${updatedJob.progress.percent.toFixed(1)}%${
              updatedJob.progress.currentVideo && updatedJob.progress.totalVideos 
                ? `, Video ${updatedJob.progress.currentVideo}/${updatedJob.progress.totalVideos}` 
                : ''
            }${updatedJob.progress.speed ? `, Speed: ${updatedJob.progress.speed}` : ''}${
              updatedJob.progress.eta ? `, ETA: ${updatedJob.progress.eta}` : ''
            }`);
            
            newMap.set(jobId, updatedJob);
          } else {
            // Create job if it doesn't exist (might have missed download-started)
            console.log("Creating missing job from progress update");
            newMap.set(jobId, {
              id: jobId,
              url: "unknown",
              type: "video",
              status: message.payload.status || "downloading",
              progress: message.payload.progress || { percent: 0 },
              outputPath: "",
              createdAt: new Date(),
            });
          }
          return newMap;
        });
        break;

      case "download-complete":
        toast.success("Download completed!", { duration: 5000 });
        setDownloads((prev) => {
          const newMap = new Map(prev);
          const jobId = message.payload.jobId;
          const existingJob = newMap.get(jobId);
          if (existingJob) {
            newMap.set(jobId, {
              ...existingJob,
              status: "completed",
              files: message.payload.files,
              progress: { ...existingJob.progress, percent: 100 },
            });
          }
          return newMap;
        });
        break;

      case "download-error":
        toast.error(`Download failed: ${message.payload.error}`, { duration: 6000 });
        setDownloads((prev) => {
          const newMap = new Map(prev);
          const jobId = message.payload.jobId;
          const existingJob = newMap.get(jobId);
          if (existingJob) {
            newMap.set(jobId, {
              ...existingJob,
              status: "failed",
              error: message.payload.error,
            });
          }
          return newMap;
        });
        break;

      case "download-cancelled":
        toast("Download cancelled", { icon: "⚠️" });
        setDownloads((prev) => {
          const newMap = new Map(prev);
          const jobId = message.payload.jobId;
          const existingJob = newMap.get(jobId);
          if (existingJob) {
            newMap.set(jobId, {
              ...existingJob,
              status: "cancelled",
            });
          }
          return newMap;
        });
        break;

      case "queue-status":
        const jobsMap = new Map();
        message.payload.jobs.forEach((job: DownloadJob) => {
          // Convert date strings to Date objects if needed
          const normalizedJob = {
            ...job,
            createdAt: typeof job.createdAt === 'string' ? new Date(job.createdAt) : job.createdAt,
            completedAt: job.completedAt && typeof job.completedAt === 'string' ? new Date(job.completedAt) : job.completedAt,
          };
          jobsMap.set(job.id, normalizedJob);
        });
        setDownloads(jobsMap);
        break;

      case "queue-cleared":
        toast.success("Queue cleared");
        setDownloads(new Map());
        break;
    }
  };

  const testEndpoint = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMetadata(null);
    setRecommendation(null);
    setSelectedPlaylistItems([]);
    setPlaylistItemFormats({});
    setGlobalPlaylistFormat(undefined);

    try {
      const form = e.currentTarget;
      const formData = new FormData(form);
      const link = formData.get("link") as string;
      const endpoint = new URL( '/api/link/metadata', location.href );
      endpoint.href += `?url=${encodeURIComponent(link)}`;
      const res = await fetch(endpoint, { method: "GET"});

      const data = await res.json() as YtDlpMetadataResponse & { recommendation?: FormatRecommendation };
      if(data.metadata) {
        setMetadata(data.metadata);
        if (data.recommendation) {
          setRecommendation(data.recommendation);
        }
      }
      responseInputRef.current!.value = data.metadata ? JSON.stringify(data.metadata, null, 2) : data.rawLog ?? "No data received.";
    } catch (error) {
      responseInputRef.current!.value = String(error);
    } finally {
      setIsLoading(false);
    }
  };

  const startDownload = (formatId?: string) => {
    if (!metadata || !ws) return;

    const url = metadata.webpage_url || (metadata as any).url;
    lastDownloadUrlRef.current = url;

    // Create a temp job ID to show immediately in UI
    const tempJobId = `dl_${Date.now()}_pending`;
    setDownloads((prev) => {
      const newMap = new Map(prev);
      newMap.set(tempJobId, {
        id: tempJobId,
        url,
        type: "video",
        status: "pending",
        progress: { percent: 0 },
        outputPath: "",
        createdAt: new Date(),
      });
      return newMap;
    });

    // Determine format_id: per-item formats or global format or passed format
    let finalFormatId = formatId;
    let finalPlaylistItemFormats = playlistItemFormats;

    // If it's a playlist and we have a global format, apply it to all selected items without specific formats
    if (metadata._type === "playlist" && globalPlaylistFormat) {
      selectedPlaylistItems.forEach((idx) => {
        if (!finalPlaylistItemFormats[idx]) {
          finalPlaylistItemFormats = { ...finalPlaylistItemFormats, [idx]: globalPlaylistFormat };
        }
      });
    }

    const request = {
      type: "download-request",
      payload: {
        url,
        format_id: finalFormatId,
        subfolder: subfolder || undefined,
        filename: filename || undefined,
        playlistItems: selectedPlaylistItems.length > 0 ? selectedPlaylistItems : undefined,
        playlistItemFormats: Object.keys(finalPlaylistItemFormats).length > 0 ? finalPlaylistItemFormats : undefined,
      },
    };

    console.log("Sending download request:", request);
    ws.send(JSON.stringify(request));
  };

  const cancelDownload = (jobId: string) => {
    if (!ws) return;
    ws.send(JSON.stringify({
      type: "download-cancel",
      payload: { jobId },
    }));
  };

  const clearQueue = () => {
    if (!ws) return;
    if (confirm('Are you sure you want to clear all downloads?')) {
      ws.send(JSON.stringify({
        type: "clear-queue",
        payload: {},
      }));
    }
  };

  const togglePlaylistItem = (index: number) => {
    setSelectedPlaylistItems((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      } else {
        return [...prev, index].sort((a, b) => a - b);
      }
    });
  };

  const selectAllPlaylist = () => {
    if (metadata && metadata._type === "playlist") {
      const allIndices = metadata.entries.map((_, idx) => idx + 1);
      setSelectedPlaylistItems(allIndices);
    }
  };

  const deselectAllPlaylist = () => {
    setSelectedPlaylistItems([]);
    setPlaylistItemFormats({});
  };

  const setItemFormat = (index: number, formatId?: string) => {
    setPlaylistItemFormats((prev) => {
      if (formatId === undefined) {
        const newFormats = { ...prev };
        delete newFormats[index];
        return newFormats;
      }
      return { ...prev, [index]: formatId };
    });
  };

  const applyGlobalFormat = () => {
    if (!metadata || metadata._type !== "playlist" || !globalPlaylistFormat) return;
    
    const newFormats: Record<number, string> = {};
    selectedPlaylistItems.forEach((idx) => {
      newFormats[idx] = globalPlaylistFormat;
    });
    setPlaylistItemFormats(newFormats);
  };

  return (
    <div className="mt-8 mx-auto w-full max-w-6xl text-left flex flex-col gap-4">
      <form
        onSubmit={testEndpoint}
        className="flex items-center gap-2 bg-[#1a1a1a] p-3 rounded-xl font-mono border-2 border-[#fbf0df] transition-colors duration-300 focus-within:border-[#f3d5a3] w-full"
      >
        <input
          type="url"
          name="link"
          required={true}
          placeholder="https://www.youtube.com/watch?v=***"
          className="w-full flex-1 bg-transparent border-0 text-[#fbf0df] font-mono text-base py-1.5 px-2 outline-none focus:text-white placeholder-[#fbf0df]/40"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="bg-[#fbf0df] text-[#1a1a1a] border-0 px-5 py-1.5 rounded-lg font-bold transition-all duration-100 hover:bg-[#f3d5a3] hover:-translate-y-px cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
         Load
        </button>
      </form>

      {/* Download Controls */}
      {metadata && (
        <div className="bg-[#1a1a1a] border-2 border-[#fbf0df] rounded-xl p-4">
          <h3 className="text-white font-semibold mb-3">Download Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[#fbf0df]/70 text-sm mb-1">Subfolder (optional)</label>
              <input
                type="text"
                value={subfolder}
                onChange={(e) => setSubfolder(e.target.value)}
                placeholder="e.g., %(uploader)s"
                className="w-full bg-[#0d0d0d] border border-[#fbf0df]/20 rounded-lg p-2 text-[#fbf0df] font-mono text-sm focus:border-[#f3d5a3] outline-none"
              />
            </div>
            <div>
              <label className="block text-[#fbf0df]/70 text-sm mb-1">Filename Template</label>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="%(title)s.%(ext)s"
                className="w-full bg-[#0d0d0d] border border-[#fbf0df]/20 rounded-lg p-2 text-[#fbf0df] font-mono text-sm focus:border-[#f3d5a3] outline-none"
              />
            </div>
          </div>
          <p className="text-xs text-[#fbf0df]/50 mt-2">
            Variables: %(title)s, %(uploader)s, %(id)s, %(ext)s, %(resolution)s, %(playlist)s, %(playlist_index)s
          </p>
        </div>
      )}

      {/* Playlist Selection */}
      {metadata && metadata._type === "playlist" && (
        <div className="bg-[#1a1a1a] border-2 border-[#fbf0df] rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-white font-semibold text-lg">
                {metadata.title}
              </h3>
              <p className="text-[#fbf0df]/60 text-sm mt-0.5">
                {metadata.uploader && <span>{metadata.uploader} • </span>}
                {metadata.playlist_count} video{metadata.playlist_count !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={selectAllPlaylist}
                className="text-sm bg-[#fbf0df] text-[#1a1a1a] px-4 py-2 rounded-lg font-medium hover:bg-[#f3d5a3] transition-colors"
              >
                Select All
              </button>
              <button
                onClick={deselectAllPlaylist}
                className="text-sm bg-[#0d0d0d] text-[#fbf0df] border border-[#fbf0df]/20 px-4 py-2 rounded-lg font-medium hover:bg-[#252525] transition-colors"
              >
                Clear
              </button>
              {selectedPlaylistItems.length > 0 && (
                <button
                  onClick={() => startDownload()}
                  className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  Download {selectedPlaylistItems.length}
                </button>
              )}
            </div>
          </div>

          {/* Global Format Settings */}
          {selectedPlaylistItems.length > 0 && (
            <div className="mb-4 p-3 bg-[#0d0d0d] border border-[#fbf0df]/20 rounded-lg">
              <h4 className="text-sm font-semibold text-white mb-2">Global Format Settings</h4>
              <p className="text-xs text-[#fbf0df]/60 mb-2">
                Apply the same format to all selected videos (optional)
              </p>
              <div className="flex gap-2 items-center">
                <select
                  value={globalPlaylistFormat || ""}
                  onChange={(e) => setGlobalPlaylistFormat(e.target.value || undefined)}
                  className="flex-1 bg-[#1a1a1a] border border-[#fbf0df]/20 rounded-lg p-2 text-[#fbf0df] text-sm focus:border-[#f3d5a3] outline-none"
                >
                  <option value="">Auto (Best Quality)</option>
                  <option value="bestvideo[height<=720]+bestaudio/best[height<=720]">720p</option>
                  <option value="bestvideo[height<=1080]+bestaudio/best[height<=1080]">1080p</option>
                  <option value="bestvideo[height<=1440]+bestaudio/best[height<=1440]">1440p</option>
                  <option value="bestvideo[height<=2160]+bestaudio/best[height<=2160]">4K (2160p)</option>
                  <option value="bestaudio/best">Audio Only</option>
                </select>
                <button
                  onClick={applyGlobalFormat}
                  disabled={!globalPlaylistFormat}
                  className="bg-[#fbf0df] text-[#1a1a1a] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#f3d5a3] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply to All
                </button>
              </div>
            </div>
          )}
          
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
            {metadata.entries.map((entry, idx) => {
              const playlistIndex = idx + 1;
              return (
                <PlaylistItem
                  key={entry.id}
                  entry={entry}
                  index={playlistIndex}
                  isSelected={selectedPlaylistItems.includes(playlistIndex)}
                  onToggle={() => togglePlaylistItem(playlistIndex)}
                  selectedFormat={playlistItemFormats[playlistIndex]}
                  onFormatChange={(formatId) => setItemFormat(playlistIndex, formatId)}
                />
              );
            })}
          </div>
          
          {selectedPlaylistItems.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[#fbf0df]/20">
              <p className="text-sm text-[#fbf0df]/70 text-center">
                <span className="font-semibold text-white">{selectedPlaylistItems.length}</span> of{' '}
                <span className="font-semibold text-white">{metadata.playlist_count}</span> videos selected
              </p>
            </div>
          )}
        </div>
      )}

      {/* Collapsible Logs Section */}
      <div className="bg-[#1a1a1a] border-2 border-[#fbf0df] rounded-xl overflow-hidden">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="w-full flex items-center justify-between p-3 text-left hover:bg-[#252525] transition-colors"
        >
          <span className="text-[#fbf0df] font-semibold">Debug Logs</span>
          <span className="text-[#fbf0df] text-xl">{showLogs ? '▼' : '▶'}</span>
        </button>
        {showLogs && (
          <div className="border-t border-[#fbf0df]/20">
            <textarea
              ref={responseInputRef}
              readOnly
              value={isLoading ? "Loading..." : undefined}
              placeholder={isLoading ? "Loading..." : "Logs will appear here..."}
              className="w-full min-h-[140px] bg-[#0d0d0d] border-0 p-3 text-[#fbf0df] font-mono text-sm resize-y focus:outline-none placeholder-[#fbf0df]/40"
            />
          </div>
        )}
      </div>

      {/* Download Queue */}
      {downloads.size > 0 && (
        <div className="bg-[#1a1a1a] border-2 border-[#fbf0df] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold">Download Queue</h3>
            <button
              onClick={clearQueue}
              className="text-xs bg-red-500/20 text-red-400 border border-red-400/20 px-3 py-1.5 rounded hover:bg-red-500/30 transition-colors"
            >
              Clear Queue
            </button>
          </div>
          <div className="space-y-2">
            {Array.from(downloads.values()).map((job) => (
              <div
                key={job.id}
                className="bg-[#0d0d0d] border border-[#fbf0df]/20 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1">
                    <p className="text-sm text-[#fbf0df] truncate font-mono">
                      {job.url}
                    </p>
                    <p className="text-xs text-[#fbf0df]/60 mt-1">
                      Status: <span className={`font-semibold ${
                        job.status === "completed" ? "text-green-400" :
                        job.status === "failed" ? "text-red-400" :
                        job.status === "cancelled" ? "text-gray-400" :
                        job.status === "downloading" ? "text-blue-400" :
                        "text-yellow-400"
                      }`}>{job.status}</span>
                      {job.progress.currentVideo && job.progress.totalVideos && (
                        <span className="ml-2">
                          Video {job.progress.currentVideo}/{job.progress.totalVideos}
                        </span>
                      )}
                    </p>
                  </div>
                  {(job.status === "pending" || job.status === "downloading") && (
                    <button
                      onClick={() => cancelDownload(job.id)}
                      className="text-xs bg-red-500/20 text-red-400 border border-red-400/20 px-3 py-1 rounded hover:bg-red-500/30"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                
                {/* Progress Bar */}
                {job.status === "downloading" && (
                  <div className="space-y-1">
                    {job.progress.currentFile && (
                      <p className="text-xs text-[#fbf0df]/70 mb-1 truncate">
                        📝 {job.progress.currentFile}
                      </p>
                    )}
                    <div className="w-full bg-[#1a1a1a] rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-[#fbf0df] h-full transition-all duration-300"
                        style={{ width: `${job.progress.percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-[#fbf0df]/60">
                      <span>{job.progress.percent.toFixed(1)}%</span>
                      {job.progress.speed && <span>{job.progress.speed}</span>}
                      {job.progress.eta && <span>ETA: {job.progress.eta}</span>}
                    </div>
                  </div>
                )}

                {/* Completed Files */}
                {job.status === "completed" && job.files && job.files.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {job.files.map((file, idx) => (
                      <a
                        key={idx}
                        href={`/api/files?file=${encodeURIComponent(file.split("/").slice(-2).join("/"))}`}
                        download
                        className="block text-xs text-blue-400 hover:text-blue-300 underline truncate"
                      >
                        📥 {file.split("/").pop()}
                      </a>
                    ))}
                  </div>
                )}

                {/* Error */}
                {job.status === "failed" && job.error && (
                  <p className="text-xs text-red-400 mt-2">{job.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {metadata && metadata._type !== "playlist" ? (
        <Metadata 
          metadata={metadata as VideoMetadata} 
          recommendation={recommendation}
          onDownload={startDownload}
        />
      ) : null}
    </div>
  );
}
