import { Logger } from "./logger.js";
import fs from "fs";
import { fileURLToPath } from "url";
import YAML from "yamljs";

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

    let allDefaults = this.readFile(this.defaultConfPath);
    for (let key in allDefaults) {
      if (key.startsWith(VARIABLE_PREFIX)) {
        this.variables.set(key.replace(VARIABLE_PREFIX, ""), allDefaults[key]);
      }
    }

    this.confPath = ROOT_PATH + this.getDefault(KEY_CONF_PATH);
    if (!fs.existsSync(this.confPath)) {
      this.confPath = null;
      if (!Config.confFileWarnShown) {
        logger.warn(
          "configuration file " + this.confPath + " not found, using defaults"
        );
        Config.confFileWarnShown = true;
      } else {
        // swallow
      }
    }
  }

  get(key: string) {
    let value;
    if (this.confPath) {
      let confFile = this.readFile(this.confPath);
      if (confFile) {
        value = confFile[key];
      }
    }
    if (!value) {
      value = this.getDefault(key);
    }

    if (!value) {
      throw new Error("configuration key " + key + " not found");
    }
    return value;
  }

  getDefault(key: string) {
    let template = this.readFile(this.defaultConfPath)[key];

    this.variables.forEach((variableValue, variableKey) => {
      template = template.replace("{{" + variableKey + "}}", variableValue);
    });

    return template;
  }

  readFile(filePath: string) {
    return YAML.load(filePath);
  }
}
