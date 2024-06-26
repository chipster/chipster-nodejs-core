import VError from "verror";
import path from "path";
import winston, { createLogger, format, transports } from "winston";
import type { StreamTransportInstance } from "winston/lib/winston/transports/index.js";
const { combine, timestamp, printf } = format;

export class Logger {
  static consoleTransoport = new transports.Console({
    level: "info",
  });
  static fileTransport = new transports.File({
    filename: "logs/chipster.log",
    level: "info",
  });

  static loggers: Logger[] = [];
  static enabledTransports = [Logger.consoleTransoport];

  static objectToString(obj: any) {
    if (obj instanceof Error) {
      // return "(err)" + VError.fullStack(obj);
      return VError.fullStack(obj) + "\n";
    } else if (obj instanceof String) {
      //   return "(str)" + obj;
      return obj;
    } else if (obj instanceof Object) {
      //   return "(obj)" + JSON.stringify(obj);
      return JSON.stringify(obj);
    } else {
      //   return "(" + typeof obj + ") " + obj;
      return obj;
    }
  }

  static addLogFile() {
    Logger.enabledTransports.push(<any>Logger.fileTransport);

    Logger.loggers.forEach((logger: any) => {
      logger.configure({
        transports: Logger.enabledTransports,
      });
    });
  }

  static getLogger(sourceCodeFilePath: string, logFile?: string) {
    let filename = path.basename(sourceCodeFilePath);

    const chipsterFormat = printf((info: any) => {
      let message = info.message;
      // no idea why "info instanceof VError" doesn't work, but luckily VError.fullStack() works just fine for regular Errors
      if (info instanceof Error) {
        // recommended:
        // logger.error(new Error("plain error"));
        // logger.error(new VError(new Error("original error"), "wrapping verror"));
        message = VError.fullStack(info) + "\n";
      } else if (info.message instanceof Error) {
        // not recommnended, but works. Ugly message concatenation
        // logger.error("text before", new Error("plain error"));
        // not recommnended, but works. New line added after stacks to make the "text after" more visible
        // logger.error(new Error("plain error"), "text after");
        message = VError.fullStack(info.message) + "\n";
      }
      // Winston seems to expect just one string by default, so maybe we should stick with that for the committed log messages
      // logger.error("the answer is " + 3)
      // the following allows us to pass multiple objects, which could be handy for temporary debug messages
      // logger.error("the answer is", 3)
      const metaArray = info[Symbol.for("splat")] || [];
      const metaString = metaArray
        .map((meta: any) => Logger.objectToString(meta))
        .join(" ");

      return (
        "[" +
        info.timestamp +
        "] " +
        info.level.toUpperCase() +
        ": " +
        (message ? message : "") +
        (metaString ? " " + metaString : "") +
        " (in " +
        filename +
        ")"
      );
    });

    const enabledTransports: StreamTransportInstance[] = [
      Logger.consoleTransoport,
    ];

    if (logFile) {
      enabledTransports.push(
        new winston.transports.File({ filename: logFile })
      );
    }

    const logger = createLogger({
      format: combine(timestamp(), chipsterFormat),
      transports: enabledTransports,
      exitOnError: false,
    });
    Logger.loggers.push(logger);
    return logger;
  }
}
