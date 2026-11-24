import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  // Dev only: let the ngrok tunnel load /_next/* dev resources (incl. the HMR
  // websocket). Next 16 blocks cross-origin dev requests by default.
  allowedDevOrigins: ["*.ngrok-free.app"],
};

export default withEve(nextConfig);
