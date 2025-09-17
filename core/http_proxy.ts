import httpProxy from "http-proxy";
import { IncomingMessage, ServerResponse } from "http";
import { Socket } from "net";
import zlib from "zlib";
import { parse } from "tldts";

import Logger from "./logger.ts";
import Injector from "./injector.ts";

export default class HttpProxy extends Logger {
  public proxyInstance: httpProxy;
  public targetDomain: string = "";
  public forwardDomain: string = "";
  public rewriteDomain: string = "";
  public injector?: Injector = null;

  protected CONTENT_TYPE_REGEX = /text\/html/;

  protected REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308];

  private cookieJar = new Map<string, string[]>();

  constructor(
    targetDomain: string | null = null,
    forwardDomain: string | null = null,
    rewriteDomain: string | null = null,
    injector: Injector = null
  ) {
    super();

    this.injector = injector;

    const options = {
      changeOrigin: true,
      autoRewrite: true,
      ws: true,
      selfHandleResponse: true,
      cookieDomainRewrite: forwardDomain,
    }

    if (targetDomain) {
      options['target'] = targetDomain;
    }

    if (forwardDomain) {
      options['hostRewrite'] = forwardDomain;
    }

    this.proxyInstance = httpProxy.createProxyServer(options);
    this.proxyInstance.on("error", this.error.bind(this));
    this.proxyInstance.on("proxyRes", this.proxyRes.bind(this));
    this.targetDomain = targetDomain;
    this.forwardDomain = forwardDomain;
    this.rewriteDomain = rewriteDomain;

    if (forwardDomain) {
      this.logInfo(`Proxy initialized with domain: ${forwardDomain}`);
    } else {
      this.logWarn("Proxy initialized without domain");
    }
  }

  private decompressResponse(body: Buffer, encoding: string | undefined): Buffer {
    if (encoding === "gzip") {
      return zlib.gunzipSync(body);
    } else if (encoding === "deflate") {
      return zlib.inflateSync(body);
    } else if (encoding === "br") {
      return zlib.brotliDecompressSync(body);
    } else {
      return body;
    }
  }

  private storeCookies(host: string, setCookies: string[]) {
    const existing = this.cookieJar.get(host) || [];
    this.cookieJar.set(host, [...existing, ...setCookies]);
  }

  private getCookies(host: string): string | undefined {
    const stored = this.cookieJar.get(host);
    if (!stored || stored.length === 0) return undefined;

    const pairs = stored.map(c => c.split(";")[0]);

    const unique: Record<string, string> = {};
    for (const pair of pairs) {
      const [name, value] = pair.split("=");
      unique[name.trim()] = value.trim();
    }

    return Object.entries(unique).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private proxyRes(
    proxyRes: IncomingMessage,
    req: IncomingMessage,
    res: ServerResponse
  ) {

    const reqBody: Buffer[] = [];

    if (proxyRes.headers["access-control-allow-origin"]) {
      proxyRes.headers["access-control-allow-origin"] =
        req.headers.origin || "*";
    }

    if (proxyRes.headers["access-control-allow-credentials"]) {
      proxyRes.headers["access-control-allow-credentials"] = "true";
    }

    if (req.method === "OPTIONS") {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": req.headers.origin || "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] || "*",
        "Access-Control-Allow-Credentials": "true",
      });
      res.end();
      return;
    }

    proxyRes.on("data", (chunk) => {
      reqBody.push(chunk);
    });

    proxyRes.on("end", () => {

      let responseBody = Buffer.concat(reqBody);
      let responseBodyHtml: string = "";

      const encoding = proxyRes.headers["content-encoding"];
      const contentType = proxyRes.headers["content-type"] || ""
      const headers = { ...proxyRes.headers };

      if (headers['set-cookie']) {
        if (this.forwardDomain) {
          if (Array.isArray(headers['set-cookie'])) {
            const parsedDomain = parse(this.forwardDomain);
            headers['set-cookie'] = headers['set-cookie'].map((cookie) =>
              cookie.replace(/Domain=[^;]+;/i, `Domain=${parsedDomain.domain || parsedDomain.hostname};`)
            );
            this.storeCookies(this.forwardDomain, headers['set-cookie']);
          }
        }
      }

      // ===== Handle Redirects ======
      if (this.REDIRECT_STATUS_CODES.includes(proxyRes.statusCode)) {
        if (headers.location) {
          headers.location = headers.location.replace(
            this.targetDomain,
            `${this.forwardDomain}`
          );
        }

        res.writeHead(proxyRes.statusCode, headers);
        res.end();
        return;
      }

      if (this.CONTENT_TYPE_REGEX.test(contentType) && proxyRes.statusCode === 200) {
        try {
          responseBodyHtml = this.decompressResponse(responseBody, encoding).toString("utf8");
        } catch (e) {
          this.logError(`Decompression with ${encoding} error: ${e.message}`);
          responseBodyHtml = responseBody.toString("utf8");
        }

        // ====== Inject JS ======
        if (contentType.includes("text/html") && this.injector) {
          responseBodyHtml = this.injector.injectJS(responseBodyHtml);
          responseBodyHtml = this.injector.injectStaticAssets(responseBodyHtml);
        }

        // ====== Rewrite headers =====
        const existingCookies = this.getCookies(this.forwardDomain);
        if (existingCookies) {
          // ========== Inject cookies ==========
          headers["cookie"] = existingCookies;
        }

        delete headers["content-length"];
        delete headers["content-encoding"];
        delete headers["transfer-encoding"];
        delete headers["accept-ranges"];
        delete headers["vary"]; // optional, can confuse caching
        delete headers['content-security-policy'];
        delete headers['content-security-policy-report-only'];

        res.writeHead(proxyRes.statusCode || 200, headers);
        res.end(responseBodyHtml);

      } else {
        headers["Access-Control-Allow-Origin"] = req.headers.origin || "*";
        headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS";
        headers["Access-Control-Allow-Headers"] = req.headers["access-control-request-headers"] || "*";
        headers["Access-Control-Allow-Credentials"] = "true";
        delete headers["content-length"];
        delete headers["transfer-encoding"];
        delete headers["accept-ranges"];
        res.writeHead(proxyRes.statusCode || 200, headers);
        res.write(responseBody);
        res.end();
      }
    });
  }

  private error(
    err: Error,
    req: IncomingMessage,
    res: ServerResponse | Socket
  ): void {
    this.logError(`Proxy error: ${err.message}`);
    if (res instanceof ServerResponse) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(
        "Something went wrong. And we are reporting a custom error message."
      );
    } else if (res instanceof Socket) {
      res.end();
    }
  }
}
