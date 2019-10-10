import { RxHR, RxHttpRequestResponse } from "@akanass/rx-http-request";
import {
  Dataset,
  Job,
  JobState,
  Module,
  Rule,
  Session,
  Tool
} from "chipster-js-common";
import { CoreOptions } from "request";
import {
  Observable,
  of,
  Subject,
  throwError as observableThrowError
} from "rxjs";
import { map, mergeMap } from "rxjs/operators";
import { Config } from "./config";
import { Logger } from "./logger";

const restify = require("restify");
const request = require("request");
const fs = require("fs");
const errors = require("restify-errors");
const YAML = require("yamljs");
const http = require("http");
const https = require("https");

const logger = Logger.getLogger(__filename);

export class RestClient {
  readonly agentOptions = {
    keepAlive: true,
    maxSockets: 4,
    keepAliveMsecs: 3000
  };

  readonly httpAgent = new http.Agent(this.agentOptions);
  readonly httpsAgent = new https.Agent(this.agentOptions);

  private config;
  serviceLocatorUri: string;
  token: string;

  constructor(
    private isClient: boolean,
    token: string,
    serviceLocatorUri?: string
  ) {
    if (isClient) {
      this.setServiceLocatorUri(serviceLocatorUri);
    } else {
      this.config = new Config();
      this.serviceLocatorUri = this.config.get(
        Config.KEY_URL_INT_SERVICE_LOCATOR
      );
    }
    this.setToken(token);
  }

  setServiceLocatorUri(uri: string) {
    this.serviceLocatorUri = uri;
  }

  setToken(token: string) {
    this.token = token;
  }

  getToken(username: string, password: string): Observable<string> {
    return this.getAuthUri().pipe(
      map(authUri => authUri + "/tokens/"),
      mergeMap(uri =>
        this.post(uri, this.getBasicAuthHeader(username, password))
      )
    );
  }

  getAuthPublicKey(username: string, token: string): Observable<string> {
    return this.getAuthUri().pipe(
      mergeMap(authUri =>
        this.getWithToken(authUri + "/tokens/publicKey", token)
      )
    );

  }
  getStatus(host): Observable<any> {
    return this.getJson(host + "/admin/status", this.token);
  }

  getSessions(): Observable<Session[]> {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri =>
        this.getJson(sessionDbUri + "/sessions/", this.token)
      )
    );
  }

  getExampleSessions(app: string): Observable<Session[]> {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri =>
        this.getJson(sessionDbUri + "/sessions?appId=" + app, this.token)
      )
    );
  }

  getSession(sessionId: string): Observable<Session> {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri =>
        this.getJson(sessionDbUri + "/sessions/" + sessionId, this.token)
      )
    );
  }

  postSession(session: Session) {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri =>
        this.postJson(sessionDbUri + "/sessions/", this.token, session)
      ),
      map((resp: any) => JSON.parse(resp).sessionId)
    );
  }

  extractSession(sessionId: string, datasetId: string) {
    return this.getSessionWorkerUri().pipe(
      mergeMap(uri =>
        this.postJson(
          uri + "/sessions/" + sessionId + "/datasets/" + datasetId,
          this.token,
          null
        )
      )
    );
  }

  packageSession(sessionId: string, file: string) {
    return this.getSessionWorkerUri().pipe(
      mergeMap(uri => this.getToFile(uri + "/sessions/" + sessionId, file))
    );
  }

  deleteSession(sessionId: string) {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri =>
        this.deleteWithToken(
          sessionDbUri + "/sessions/" + sessionId,
          this.token
        )
      )
    );
  }

  getDatasets(sessionId): Observable<Dataset[]> {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri => {
        return this.getJson(
          sessionDbUri + "/sessions/" + sessionId + "/datasets/",
          this.token
        );
      })
    );
  }

  getDataset(sessionId, datasetId): Observable<Dataset> {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri => {
        return this.getJson(
          sessionDbUri + "/sessions/" + sessionId + "/datasets/" + datasetId,
          this.token
        );
      })
    );
  }

  deleteDataset(sessionId: string, datasetId: string) {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri =>
        this.deleteWithToken(
          sessionDbUri + "/sessions/" + sessionId + "/datasets/" + datasetId,
          this.token
        )
      )
    );
  }

  postDataset(sessionId: string, dataset: Dataset) {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri =>
        this.postJson(
          sessionDbUri + "/sessions/" + sessionId + "/datasets/",
          this.token,
          dataset
        )
      ),
      map((resp: any) => JSON.parse(resp).datasetId)
    );
  }

  putDataset(sessionId: string, dataset: Dataset) {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri =>
        this.putJson(
          sessionDbUri +
          "/sessions/" +
          sessionId +
          "/datasets/" +
          dataset.datasetId,
          this.token,
          dataset
        )
      )
    );
  }

  getJobs(sessionId): Observable<Job[]> {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri => {
        return this.getJson(
          sessionDbUri + "/sessions/" + sessionId + "/jobs/",
          this.token
        );
      })
    );
  }

  getJob(sessionId, jobId): Observable<Job> {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri => {
        return this.getJson(
          sessionDbUri + "/sessions/" + sessionId + "/jobs/" + jobId,
          this.token
        );
      })
    );
  }

  postJob(sessionId: string, job: Job) {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri =>
        this.postJson(
          sessionDbUri + "/sessions/" + sessionId + "/jobs/",
          this.token,
          job
        )
      ),
      map((resp: any) => JSON.parse(resp).jobId)
    );
  }

  putJob(sessionId: string, job: Job) {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri =>
        this.putJson(
          sessionDbUri + "/sessions/" + sessionId + "/jobs/" + job.jobId,
          this.token,
          job
        )
      )
    );
  }

  deleteJob(sessionId: string, jobId: string) {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri =>
        this.deleteWithToken(
          sessionDbUri + "/sessions/" + sessionId + "/jobs/" + jobId,
          this.token
        )
      )
    );
  }

  cancelJob(sessionId: string, jobId: string) {
    return this.getJob(sessionId, jobId).pipe(
      mergeMap((job: Job) => {
        job.state = JobState.Cancelled;
        job.stateDetail = "";
        return this.putJob(sessionId, job);
      })
    );
  }

  getTools(): Observable<Module[]> {
    return this.getToolboxUri().pipe(
      mergeMap(uri => {
        return this.getJson(uri + "/modules/", null);
      })
    );
  }

  getTool(toolId): Observable<Tool> {
    return this.getToolboxUri().pipe(
      mergeMap(uri => this.getJson(uri + "/tools/" + toolId, null)),
      map((toolBoxTool: any) => toolBoxTool.sadlDescription)
    );
  }

  downloadFile(sessionId: string, datasetId: string, file: string) {
    return this.getFileBrokerUri().pipe(
      mergeMap(fileBrokerUri =>
        this.getToFile(
          fileBrokerUri + "/sessions/" + sessionId + "/datasets/" + datasetId,
          file
        )
      )
    );
  }

  getToFile(uri: string, file: string) {
    let subject = new Subject<any>();
    this.getFileBrokerUri().subscribe(fileBrokerUri => {
      request
        .get(uri)
        .on("response", resp => this.checkForError(resp))
        .on("end", () => {
          subject.next();
          subject.complete();
        })
        .auth("token", this.token)
        .pipe(this.getWriteStream(file));
    });
    return subject;
  }

  getWriteStream(file: string) {
    if (file === "-") {
      return process.stdout;
    } else {
      return fs.createWriteStream(file);
    }
  }

  getReadStream(file: string) {
    if (file === "-") {
      return process.stdin;
    } else {
      return fs.createReadStream(file);
    }
  }

  uploadFile(sessionId: string, datasetId: string, file: string) {
    let subject = new Subject<any>();
    this.getFileBrokerUri().subscribe(fileBrokerUri => {
      let req = request
        .put(
          fileBrokerUri + "/sessions/" + sessionId + "/datasets/" + datasetId
        )
        .auth("token", this.token)
        .on("response", resp => this.checkForError(resp))
        .on("end", () => {
          subject.next(datasetId);
          subject.complete();
        });

      this.getReadStream(file).pipe(req);
    });
    return subject;
  }

  getRules(sessionId): Observable<Rule[]> {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri =>
        this.getJson(
          sessionDbUri + "/sessions/" + sessionId + "/rules",
          this.token
        )
      )
    );
  }

  postRule(
    sessionId: string,
    username: string,
    readWrite: boolean
  ): Observable<any> {
    let rule = {
      session: { sessionId: sessionId },
      username: username,
      readWrite: readWrite
    };
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri =>
        this.postJson(
          sessionDbUri + "/sessions/" + sessionId + "/rules",
          this.token,
          rule
        )
      )
    );
  }

  deleteRule(sessionId: string, ruleId: string) {
    return this.getSessionDbUri().pipe(
      mergeMap(sessionDbUri =>
        this.deleteWithToken(
          sessionDbUri + "/sessions/" + sessionId + "/rules/" + ruleId,
          this.token
        )
      )
    );
  }

  checkForError(response: any) {
    if (response.statusCode >= 300) {
      throw new Error(response.stausCode + " - " + response.statusMessage);
    }
  }

  getFile(sessionId, datasetId, maxLength) {
    // Range request 0-0 would produce 416 - Range Not Satifiable
    if (maxLength === 0) {
      return of("");
    }

    return this.getFileBrokerUri().pipe(
      mergeMap(fileBrokerUri => {
        return this.getWithToken(
          fileBrokerUri + "/sessions/" + sessionId + "/datasets/" + datasetId,
          this.token,
          { Range: "bytes=0-" + maxLength }
        );
      })
    );
  }

  getAuthUri() {
    return this.getServiceUri("auth");
  }

  getFileBrokerUri() {
    return this.getServiceUri("file-broker");
  }

  getSessionDbUri() {
    return this.getServiceUri("session-db");
  }

  getSessionDbEventsUri() {
    return this.getServiceUri("session-db-events");
  }

  getToolboxUri() {
    return this.getServiceUri("toolbox");
  }

  getSessionWorkerUri() {
    return this.getServiceUri("session-worker");
  }

  getServices() {
    return this.getJson(this.serviceLocatorUri + "/services", null);
  }

  getServiceUri(serviceName) {
    return this.getServices().pipe(
      map(services => {
        let service = services.filter(
          service => service.role === serviceName
        )[0];
        if (!service) {
          observableThrowError(
            new errors.InternalServerError("service not found" + serviceName)
          );
        }
        // the typeService doesn't have up-to-date token for itself, so we don't have access
        // to the internal URL
        //return this.isClient ? service.publicUri : service.uri;
        return service.publicUri;
      })
    );
  }

  getServiceLocator(webServer) {
    return this.getPooled(webServer + "/assets/conf/chipster.yaml").pipe(
      map(resp => {
        let body = this.handleResponse(resp);
        let conf = YAML.parse(body);
        return conf["service-locator"];
      })
    );
  }

  getPooled(
    uri: string,
    options?: CoreOptions
  ): Observable<RxHttpRequestResponse<any>> {
    // clone before modifying
    const options2 = Object.assign({}, options);
    options2.agent = this.getAgent(uri);
    return RxHR.get(uri, options2);
  }

  putPooled(
    uri: string,
    options?: CoreOptions
  ): Observable<RxHttpRequestResponse<any>> {
    // clone before modifying
    const options2 = Object.assign({}, options);
    options2.agent = this.getAgent(uri);
    return RxHR.put(uri, options2);
  }

  postPooled(
    uri: string,
    options?: CoreOptions
  ): Observable<RxHttpRequestResponse<any>> {
    // clone before modifying
    const options2 = Object.assign({}, options);
    options2.agent = this.getAgent(uri);
    return RxHR.post(uri, options2);
  }

  deletePooled(
    uri: string,
    options?: CoreOptions
  ): Observable<RxHttpRequestResponse<any>> {
    // clone before modifying
    const options2 = Object.assign({}, options);
    options2.agent = this.getAgent(uri);
    return RxHR.delete(uri, options2);
  }

  getJson(uri: string, token: string): Observable<any> {
    return this.getWithToken(uri, token).pipe(map(data => JSON.parse(data)));
  }

  getWithToken(
    uri: string,
    token: string,
    headers?: Object
  ): Observable<string> {
    if (token) {
      return this.get(uri, this.getBasicAuthHeader("token", token, headers));
    } else {
      return this.get(uri, headers);
    }
  }

  getBasicAuthHeader(username, password, headers?) {
    if (!headers) {
      headers = {};
    }

    headers["Authorization"] =
      "Basic " + Buffer.from(username + ":" + password).toString("base64");

    return headers;
  }

  getAgent(uri: string) {
    if (uri.startsWith("https")) {
      return this.httpsAgent;
    }
    return this.httpAgent;
  }

  get(uri: string, headers?: Object): Observable<string> {
    let options = {
      headers: headers
    };

    logger.debug("get()", uri + " " + JSON.stringify(options.headers));

    return this.getPooled(uri, options).pipe(
      map(data => this.handleResponse(data))
    );
  }

  post(uri: string, headers?: Object, body?: Object): Observable<string> {
    let options = {
      headers: headers,
      body: body
    };
    logger.debug("post()", uri + " " + JSON.stringify(options.headers));
    return this.postPooled(uri, options).pipe(
      map(data => this.handleResponse(data))
    );
  }

  put(uri: string, headers?: Object, body?: Object): Observable<string> {
    let options = {
      headers: headers,
      body: body
    };
    logger.debug("put()", uri + " " + JSON.stringify(options.headers));
    return this.putPooled(uri, options).pipe(
      map(data => this.handleResponse(data))
    );
  }

  postJson(uri: string, token: string, data: any): Observable<string> {
    let headers = this.getBasicAuthHeader("token", token);
    headers["content-type"] = "application/json";
    return this.post(uri, headers, JSON.stringify(data));
  }

  putJson(uri: string, token: string, data: any): Observable<string> {
    let headers = this.getBasicAuthHeader("token", token);
    headers["content-type"] = "application/json";
    return this.put(uri, headers, JSON.stringify(data));
  }

  deleteWithToken(uri: string, token: string) {
    return this.delete(uri, this.getBasicAuthHeader("token", token));
  }

  delete(uri: string, headers?: Object): Observable<any> {
    let options = {
      headers: headers
    };

    return this.deletePooled(uri, options);
  }

  handleResponse(data) {
    if (data.response.statusCode >= 200 && data.response.statusCode <= 299) {
      logger.debug("response", data.body);
      return data.body;
    } else {
      if (data.response.statusCode >= 400 && data.response.statusCode <= 499) {
        logger.debug(
          "error",
          data.response.statusCode +
          " " +
          data.response.statusMessage +
          " " +
          data.response.body
        );
        throw this.responseToError(data.response);
      } else {
        logger.debug(
          "error",
          data.response.statusCode +
          " " +
          data.response.statusMessage +
          " " +
          data.response.body
        );
        throw new errors.InternalServerError(
          "request " +
          data.response.request.method +
          " " +
          data.response.request.href +
          " failed"
        );
      }
    }
  }

  responseToError(response) {
    if (this.isClient) {
      const err = new Error(
        response.statusCode +
        " - " +
        response.statusMessage +
        " (" +
        response.body +
        ") " +
        response.request.href
      );
      err["statusCode"] = response.statusCode;
      return err;
    } else {
      return new errors.HttpError({
        restCode: response.statusMessage,
        statusCode: response.statusCode,
        message: response.body
      });
    }
  }

  destroy() {
    if (this.httpAgent) {
      this.httpAgent.destroy();
    }
    if (this.httpsAgent) {
      this.httpsAgent.destroy();
    }
  }
}
