import Handlebars from "handlebars";

import { load } from "cheerio";
import { parse } from "tldts";

import Logger from "./logger.ts";
import Script from "./script.ts";

import { type ProxyConfig } from "./script.ts";

export type InjectorArgs = {
  domain?: string;
  proxy_list?: ProxyConfig[];
};

export default class Injector extends Logger {
  public script: Script = null;
  public args?: InjectorArgs;

  constructor(script?: Script, args?: InjectorArgs) {
    super();
    this.script = script;
    this.args = args;
  }

  public setArgs(args: InjectorArgs) {
    this.args = { ...this.args, ...args };
  }

  public compileJSTemplate(): string {
    try {
      const js_tpl = Handlebars.compile(this.script?.config?.js?.join("\n"));
      return js_tpl(this.args);
    } catch (error) {
      this.logError(error.message);
      return "";
    }
  }

  public injectJS(html: string, jsCode?: string): string {
    try {
      if (!jsCode) {
        jsCode = this.compileJSTemplate();
      }
      return html.replace("</body>", `<script nonce>${jsCode}</script></body>`);
    } catch (error) {
      this.logError(error.message);
      return html;
    }
  }

  public injectStaticAssets(html: string): string {
    try {
      if (!this.script?.config?.static_assets || this.script.config.static_assets.length === 0) {
        return html;
      }

      // const $ = load(html, { decodeEntities: false });
      const body_scripts = [];
      const head_scripts = [];

      this.script.config.static_assets.forEach((asset) => {
        if (asset.type === "text/javascript") {
          body_scripts.push(`<script src="${this.args.domain}/${asset.url}" nonce></script>`);
        } else if (asset.type === "text/css") {
          head_scripts.push(`<link rel="stylesheet" href="${this.args.domain}/${asset.url}">`);
        }
      });

      return html.replace("</body>", `${body_scripts.join("\n")}</body>`)
        .replace("</head>", `${head_scripts.join("\n")}</head>`);

      // return $.html();
    } catch (error) {
      this.logError(error.message);
      return html;
    }
  }

  public replaceDomainLinks(html: string): string {
    try {
      if (!this.args.domain) {
        return html;
      }
      const $ = load(html, { decodeEntities: false });

      const elements = [
        { tag: "a", attr: "href" },
        { tag: "link", attr: "href" },
        { tag: "script", attr: "src" },
        { tag: "img", attr: "src" },
        { tag: "iframe", attr: "src" },
        { tag: "source", attr: "src" },
        { tag: "video", attr: "src" },
        { tag: "audio", attr: "src" },
      ];

      for (const proxy_config of this.args.proxy_list) {
        elements.forEach(({ tag, attr }) => {
          $(tag).each((_, element) => {
            const originalUrl = $(element).attr(attr);
            const parsedOriginalUrl = parse(originalUrl || ""); // Validate URL
            const parsedTargetDomainUrl = parse(proxy_config.target || "");
            const parsedDomain = parse(this.args.domain || "");

            if (parsedOriginalUrl.domain
              && parsedOriginalUrl.domain.startsWith(parsedTargetDomainUrl.domain)
              && (parsedOriginalUrl.subdomain === parsedTargetDomainUrl.subdomain || !parsedOriginalUrl.subdomain)
            ) {
              try {
                const urlObj = new URL(originalUrl);
                const newUrl = this.args.domain + urlObj.pathname + urlObj.search;
                $(element).attr(attr, newUrl);
              } catch (error) {
                this.logWarn(`Invalid URL skipped: ${originalUrl}`);
              }
            }
          });
        });
      }

      return $.html();
    } catch (error) {
      this.logError(error.message);
      return html;
    }
  }
}
