import { LinkFetch } from "./LinkField";
import "./index.css";
import { Toaster } from "react-hot-toast";

import logo from "./logo.svg";
import reactLogo from "./react.svg";

export function App() {
  return (
    <div className="max-w-7xl mx-auto p-8 text-center relative z-10 min-h-screen">
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1a1a1a',
            color: '#fbf0df',
            border: '1px solid #fbf0df',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fbf0df',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fbf0df',
            },
          },
        }}
      />
      <div className="mb-8">
        <h1 className="text-6xl font-bold my-4 leading-tight bg-gradient-to-r from-[#e94560] via-[#533483] to-[#0f3460] bg-clip-text text-transparent">
          yt-dlp Web
        </h1>
        <p className="text-lg text-white/80 mb-2">
          Download videos from YouTube and other platforms
        </p>
        <p className="text-sm text-white/50">
          Powered by yt-dlp, Bun, and React
        </p>
      </div>
      <LinkFetch />
    </div>
  );
}

export default App;
