import type { VideoMetadata, YtDlpMetadataResponse } from "@/types";
import { useRef, useState, type FormEvent } from "react";
import { Metadata } from "./Metadata";

export function LinkFetch() {
  const responseInputRef = useRef<HTMLTextAreaElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);

  const testEndpoint = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMetadata(null);

    try {
      const form = e.currentTarget;
      const formData = new FormData(form);
      const link = formData.get("link") as string;
      const endpoint = new URL( '/api/link/metadata', location.href );
      endpoint.href += `?url=${encodeURIComponent(link)}`;
      const res = await fetch(endpoint, { method: "GET"});

      const data = await res.json() as YtDlpMetadataResponse;
      if(data.metadata) {
        setMetadata(data.metadata);
      }
      responseInputRef.current!.value = data.metadata ? JSON.stringify(data.metadata, null, 2) : data.rawLog ?? "No data received.";
    } catch (error) {
      responseInputRef.current!.value = String(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-8 mx-auto w-full max-w-2xl text-left flex flex-col gap-4">
      <form
        onSubmit={testEndpoint}
        className="flex items-center gap-2 bg-[#1a1a1a] p-3 rounded-xl font-mono border-2 border-[#fbf0df] transition-colors duration-300 focus-within:border-[#f3d5a3] w-full"
      >
        <input
          type="url"
          name="link"
          defaultValue="https://youtu.be/dQw4w9WgXcQ"
          required={true}
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
      <textarea
        ref={responseInputRef}
        readOnly
        value={isLoading ? "Loading..." : undefined}
        placeholder={isLoading ? "Loading..." : "Logs will appear here..."}
        className="w-full min-h-[140px] bg-[#1a1a1a] border-2 border-[#fbf0df] rounded-xl p-3 text-[#fbf0df] font-mono resize-y focus:border-[#f3d5a3] placeholder-[#fbf0df]/40"
      />
      {metadata ? Metadata(metadata) : null}
    </div>
  );
}
