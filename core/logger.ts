import log from "loglevel";
import prefix from "loglevel-plugin-prefix";
import chalk from "chalk";

const colors = {
  trace: chalk.magenta,
  debug: chalk.cyan,
  info: chalk.blue,
  warn: chalk.yellow,
  error: chalk.red,
};

export default class Logger {
  constructor() {
    prefix.reg(log);

    log.enableAll();

    prefix.apply(log, {
      format(level, name, timestamp) {
        return `${chalk.gray(`[${timestamp}]`)} [${colors[level.toLocaleLowerCase()](
          level.toLocaleLowerCase()
        )}] >`;
      },
    });

    prefix.apply(log.getLogger("critical"), {
      format(level, name, timestamp) {
        return chalk.red.bold(`[${timestamp}] ${level} ${name}:`);
      },
    });
  }

  public logInfo(message: string): void {
    log.info(message);
  }

  public logWarn(message: string): void {
    log.warn(message);
  }

  public logError(message: string): void {
    log.error(message);
  }

  public logCritical(message: string): void {
    log.getLogger("critical").info(message);
  }

}
