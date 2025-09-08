import Script, { type ServerConfig } from "./core/script.ts";
import HttpServer, { type HttpServerOptions } from "./core/http_server.ts";
import { printLogo } from "./art/index.ts";

printLogo();

const script = new Script();

const config: ServerConfig | null = script.loadServerConfig();

const port = config?.server.port || 3000;

const domain = config?.server.domain || `http://localhost:${port}`;
const rewriteDomain = config?.server.rewriteDomain || "http://youtube.com";

new HttpServer({
  port,
  domain,
  rewriteDomain,
  script,
} as HttpServerOptions).start();

