import { Logger } from "./logger.js";
import fs from "fs";
import { fileURLToPath } from "url";
import { parse } from "yaml";

const logger = Logger.getLogger(fileURLToPath(import.meta.url));

const ROOT_PATH = "../../";
const DEFAULT_CONF_PATH = "src/main/resources/chipster-defaults.yaml";
const KEY_CONF_PATH = "conf-path";
const VARIABLE_PREFIX = "variable-";

export class Config {
  public static readonly KEY_URL_BIND_TYPE_SERVICE = "url-bind-type-service";
  public static readonly KEY_URL_ADMIN_BIND_TYPE_SERVICE =
    "url-admin-bind-type-service";
  public static readonly KEY_URL_INT_SERVICE_LOCATOR =
    "url-int-service-locator";
  public static readonly KEY_SECRET_TYPE_SERVICE =
    "service-password-type-service";
  public static readonly KEY_JWS_ALGORITHM = "jws-algorithm";

  private static confFileWarnShown = false;

  confPath: string | null;
  defaultConfPath: string;
  private variables = new Map<string, string>();

  constructor() {
    this.defaultConfPath = ROOT_PATH + DEFAULT_CONF_PATH;

    if (!fs.existsSync(this.defaultConfPath)) {
      throw new Error("default config file not found: " + this.defaultConfPath);
    }

    this.confPath = ROOT_PATH + this.getDefault(KEY_CONF_PATH);
    if (!fs.existsSync(this.confPath)) {
      this.confPath = null;
      if (!Config.confFileWarnShown) {
        logger.warn(
          "configuration file " + this.confPath + " not found, using defaults",
        );
        Config.confFileWarnShown = true;
      } else {
        // swallow
      }
    }

    let allDefaults = this.readFile(this.defaultConfPath);
    for (let key in allDefaults) {
      if (key.startsWith(VARIABLE_PREFIX)) {
        this.variables.set(
          key.replace(VARIABLE_PREFIX, ""),
          this.getWithOptions(key, false),
        );
      }
    }
  }

  get(key: string) {
    return this.getWithOptions(key, true);
  }

  getWithOptions(key: string, replaceVariables: boolean) {
    let value: string | undefined = undefined;
    if (this.confPath) {
      let confFile = this.readFile(this.confPath);
      if (confFile) {
        value = confFile[key];
      }
    }
    if (value == null) {
      value = this.getDefault(key);
    }

    if (value == null) {
      throw new Error("configuration key " + key + " not found");
    }

    if (replaceVariables) {
      this.variables.forEach((variableValue, variableKey) => {
        value = value?.replace("{{" + variableKey + "}}", variableValue);
      });
    }
    return value;
  }

  getDefault(key: string) {
    let template = this.readFile(this.defaultConfPath)[key];

    return template;
  }

  readFile(filePath: string) {
    const file = fs.readFileSync(filePath, "utf8");
    return parse(file);
  }
}
