import { $ } from "bun";
import type { VideoMetadata, YtDlpMetadataResponse } from "../../types";

export class YtDlpCli {
  async getMetadata(url: string): Promise<YtDlpMetadataResponse> {
    const process =
      await $`yt-dlp --no-warnings --skip-download --print-json "${url}"`;
    let rawLog = "";

    rawLog += new TextDecoder().decode(process.stdout);
    rawLog += new TextDecoder().decode(process.stderr);

    const metadata = JSON.parse(
      new TextDecoder().decode(process.stdout)
    ) as VideoMetadata;

    return { rawLog, metadata };
  }
}
