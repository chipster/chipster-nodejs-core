import { VError } from "verror";
const path = require("path");
const { createLogger, format, transports } = require("winston");
const { combine, timestamp, label, printf, metadata, splat, trace } = format;

export class Logger {
  static objectToString(obj) {
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

  static getLogger(filepath) {
    let filename = path.basename(filepath);

    const chipsterFormat = printf(info => {
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
        .map(meta => Logger.objectToString(meta))
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

    const logger = createLogger({
      format: combine(timestamp(), chipsterFormat),
      transports: [new transports.Console()],
      exitOnError: false
    });
    return logger;
  }
}
