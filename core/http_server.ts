import http from "http";
import { readFileSync, existsSync, statSync } from 'fs';
import { extname, join } from 'path';

import { type ProxyConfig } from "./script.ts";
import HttpProxy from "./http_proxy.ts";
import Logger from "./logger.ts";
import Script from "./script.ts";
import Injector from "./injector.ts";

const staticDir = join(process.cwd(), './static'); // Change to your static folder

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

export type HttpServerOptions = {
  port?: number;
  domain?: string;
  rewriteDomain?: string;
  script?: Script;
};

export default class HttpServer extends Logger {
  public port?: number;
  public domain?: string;
  public serverInstance: http.Server;

  constructor(options: HttpServerOptions = {}) {
    super();

    const { port, domain, rewriteDomain, script } = options;
    const injector = new Injector(script, { domain, proxy_list: script?.config?.proxy_list });
    const proxy = new HttpProxy(null, domain, rewriteDomain, injector);

    this.port = port;
    this.domain = domain;

    this.serverInstance = http.createServer((req, res) => {
      const url = req.url || "";

      let matchedProxy: ProxyConfig | undefined;

      let filePath = join(staticDir, url);

      if (existsSync(filePath)) {
        const ext = extname(filePath);
        if (ext) {
          try {
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            res.end(readFileSync(filePath, "utf-8"));
            return;
          } catch (err) {
            this.logError(`Error reading static file: ${err}`);
          }
        }
      }

      if (script && script.config) {
        let proxy_list: ProxyConfig[] = script.config.proxy_list.filter(
          (proxyConfig: ProxyConfig) =>
            proxyConfig.path_regex && proxyConfig.path_regex !== ""
        );

        matchedProxy = proxy_list.find((proxyConfig: ProxyConfig) => {
          if (proxyConfig.path_regex) {
            const regex = new RegExp(proxyConfig.path_regex);
            if (regex.test(url)) {
              return true;
            }
          }
          return false;
        });

        if (!matchedProxy) {
          matchedProxy = script.config.proxy_list[0];
        }

        if (matchedProxy) {
          proxy.targetDomain = matchedProxy.target;
          proxy.injector = injector;
          proxy.proxyInstance.web(req, res, {
            target: matchedProxy.target,
            changeOrigin: true,
            autoRewrite: true,
            ws: true,
            hostRewrite: domain,
            selfHandleResponse: true,
            cookieDomainRewrite: this.domain
          });
        }
      }
    });
  }

  public start(): void {
    this.serverInstance.listen(this.port, () => {
      this.logInfo(`HTTP Server is running on port ${this.port}`);
    });
  }

  public stop(): void {
    this.serverInstance.close(() => {
      this.logInfo("HTTP Server has been stopped");
    });
  }
}
