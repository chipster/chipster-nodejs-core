export declare class Config {
    static readonly KEY_URL_BIND_TYPE_SERVICE = "url-bind-type-service";
    static readonly KEY_URL_ADMIN_BIND_TYPE_SERVICE = "url-admin-bind-type-service";
    static readonly KEY_URL_INT_SERVICE_LOCATOR = "url-int-service-locator";
    private static confFileWarnShown;
    confPath: string;
    defaultConfPath: string;
    private variables;
    constructor();
    get(key: string): any;
    getDefault(key: string): any;
    readFile(filePath: string): any;
}
