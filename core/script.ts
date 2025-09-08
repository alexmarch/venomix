import yaml from "js-yaml";
import fs from "fs";
import Logger from "./logger.ts";
import { textWithColor } from "./utils.ts";

export type ServerConfig = {
  server: {
    port: number;
    domain: string;
    rewriteDomain: string;
    script: string;
  };
};

export type ProxyConfig = {
  target: string;
  path_regex?: string;
  injectCSP?: boolean;
};

export type ScriptConfig = {
  version: string;
  name?: string;
  proxy_list: ProxyConfig[];
  js?: string[];
};

export default class Script extends Logger {
  public config: ScriptConfig | null = null;

  constructor(path?: string) {
    super();

    if (path) {
      this.config = this.loadScript(path);
    } else {
      this.logWarn("No script path provided, running without script");
    }

  }

  public loadScript(filename: string): ScriptConfig | null {
    try {
      const script = yaml.load(fs.readFileSync(`./scripts/${filename}`, "utf8")) as ScriptConfig;
      this.logInfo(`Script loaded: ${textWithColor(script.name || 'unknown', 'green')} v${script.version || 'unknown'}`);
      this.config = script;
      return script as ScriptConfig;
    } catch (error) {
      this.logError(`Failed to load script from ${filename}: ${error.message}`);
      return null;
    }
  }

  public loadServerConfig(filePath: string = "server.yaml"): ServerConfig | null {
    try {
      const config: ServerConfig = yaml.load(fs.readFileSync(filePath, "utf8")) as ServerConfig;
      this.logInfo(`Server config loaded from ${filePath}`);
      this.loadScript(config.server.script);
      return config;
    } catch (error) {
      this.logError(`Failed to load server config from ${filePath}: ${error.message}`);
      return null;
    }
  }
}
