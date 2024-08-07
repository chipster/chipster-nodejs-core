import {
  Dataset,
  Job,
  JobState,
  Module,
  Rule,
  Session,
  Tool,
  Service,
} from "chipster-js-common";
import {
  Observable,
  of,
  Subject,
  throwError as observableThrowError,
} from "rxjs";
import { catchError, map, mergeMap, tap } from "rxjs/operators";
import { Config } from "./config.js";
import { Logger } from "./logger.js";
import type { ClientRequest, IncomingMessage } from "http";
import { fileURLToPath } from "url";

import fs from "fs";
import errors from "restify-errors";
import YAML from "yamljs";
import http from "http";
import https from "https";

const logger = Logger.getLogger(fileURLToPath(import.meta.url));

export class RestClient {
  private config;
  serviceLocatorUri: string | null = null;
  token: string;
  services: any;

  constructor(
    private isClient: boolean,
    token: string,
    serviceLocatorUri: string,
    private isQuiet = false
  ) {
    /*
    Requests are failing randomly with error "socket hung up" when keepAlive is enabled.
    Only observed when https connections through ha-proxy (in Rahti 2) were used.

    Seems to be a known problem in the NodeJS http/https library:
    https://github.com/node-fetch/node-fetch/issues/1735
    https://github.com/nodejs/node/issues/47130

    For example, running repeatedly "node lib/replay-session.js -q --username XXX --password XXX --filter availability/ https://SERVER"
    fails always within the first 20 cycles.

    This doesn't seem to affect type-service performance, so keepAlive was disabled also for http for the sake of uniformity.

    Open questions:
    - Why this appeared only after moving to Rahti 2, when we have used keepAlive already in Rahti 1?
    - Why his doesn't happen locally? Possible reasons: http instead of https, no ha-proxy or shorter ping.
    - Why this is only problem in NodeJS and not in other clients?
    */
    (http.globalAgent as any).keepAlive = false;
    (https.globalAgent as any).keepAlive = false;

    if (isClient) {
      this.setServiceLocatorUri(serviceLocatorUri);
    } else {
      this.config = new Config();
      this.serviceLocatorUri = this.config.get(
        Config.KEY_URL_INT_SERVICE_LOCATOR
      );
    }

    this.token = token;
  }

  setQuiet(isQuiet: boolean) {
    this.isQuiet = isQuiet;
  }

  setServiceLocatorUri(uri: string) {
    this.serviceLocatorUri = uri;
  }

  setToken(token: string) {
    this.token = token;
  }

  getToken(username: string, password: string): Observable<string | null> {
    let authUri$ = null;
    if (this.isClient) {
      // client
      authUri$ = this.getAuthUri();
    } else {
      // server
      authUri$ = this.getInternalAuthUri(username, password);
    }
    return authUri$.pipe(
      map((authUri) => authUri + "/tokens/"),
      mergeMap((uri: string) =>
        this.post(uri, this.getBasicAuthHeader(username, password))
      )
    );
  }

  getAuthPublicKey(username: string, token: string): Observable<string | null> {
    return this.getAuthUri().pipe(
      mergeMap((authUri) =>
        this.getWithToken(authUri + "/tokens/publicKey", token)
      )
    );
  }
  getStatus(host: string): Observable<any> {
    return this.getJson(host + "/admin/status", this.token);
  }

  getSessions(): Observable<Session[]> {
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) =>
        this.getJson(sessionDbUri + "/sessions/", this.token)
      )
    );
  }

  getExampleSessions(app: string): Observable<Session[]> {
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) =>
        this.getJson(sessionDbUri + "/sessions?appId=" + app, this.token)
      )
    );
  }

  getSession(sessionId: string): Observable<Session> {
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) =>
        this.getJson(sessionDbUri + "/sessions/" + sessionId, this.token)
      )
    );
  }

  postSession(session: Session) {
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) =>
        this.postJson(sessionDbUri + "/sessions/", this.token, session)
      ),
      map((resp: any) => JSON.parse(resp).sessionId)
    );
  }

  putSession(session: Session) {
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) =>
        this.putJson(
          sessionDbUri + "/sessions/" + session.sessionId,
          this.token,
          session
        )
      )
    );
  }

  extractSession(sessionId: string, datasetId: string) {
    return this.getSessionWorkerUri().pipe(
      mergeMap((uri) =>
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
      mergeMap((uri) => this.getToFile(uri + "/sessions/" + sessionId, file))
    );
  }

  deleteSession(sessionId: string) {
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) =>
        this.deleteWithToken(
          sessionDbUri + "/sessions/" + sessionId,
          this.token
        )
      )
    );
  }

  getDatasets(sessionId: string): Observable<Dataset[]> {
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) => {
        return this.getJson(
          sessionDbUri + "/sessions/" + sessionId + "/datasets/",
          this.token
        );
      })
    );
  }

  getDataset(sessionId: string, datasetId: string): Observable<Dataset> {
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) => {
        return this.getJson(
          sessionDbUri + "/sessions/" + sessionId + "/datasets/" + datasetId,
          this.token
        );
      })
    );
  }

  deleteDataset(sessionId: string, datasetId: string) {
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) =>
        this.deleteWithToken(
          sessionDbUri + "/sessions/" + sessionId + "/datasets/" + datasetId,
          this.token
        )
      )
    );
  }

  postDataset(sessionId: string, dataset: Dataset) {
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) =>
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
      mergeMap((sessionDbUri) =>
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

  getJobs(sessionId: string): Observable<Job[]> {
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) => {
        return this.getJson(
          sessionDbUri + "/sessions/" + sessionId + "/jobs/",
          this.token
        );
      })
    );
  }

  getJob(sessionId: string, jobId: string): Observable<Job> {
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) => {
        return this.getJson(
          sessionDbUri + "/sessions/" + sessionId + "/jobs/" + jobId,
          this.token
        );
      })
    );
  }

  postJob(sessionId: string, job: Job) {
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) =>
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
      mergeMap((sessionDbUri) =>
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
      mergeMap((sessionDbUri) =>
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
      mergeMap((uri) => {
        return this.getJson(uri + "/modules/", null);
      })
    );
  }

  getTool(toolId: string): Observable<Tool> {
    return this.getToolboxUri().pipe(
      mergeMap((uri) => this.getJson(uri + "/tools/" + toolId, null)),
      map((toolBoxTool: any) => toolBoxTool.sadlDescription)
    );
  }

  downloadFile(sessionId: string, datasetId: string, file: string) {
    return this.getFileBrokerUri().pipe(
      mergeMap((fileBrokerUri) =>
        this.getToFile(
          fileBrokerUri + "/sessions/" + sessionId + "/datasets/" + datasetId,
          file
        )
      )
    );
  }

  getRules(sessionId: string): Observable<Rule[]> {
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) =>
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
      readWrite: readWrite,
    };
    return this.getSessionDbUri().pipe(
      mergeMap((sessionDbUri) =>
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
      mergeMap((sessionDbUri) =>
        this.deleteWithToken(
          sessionDbUri + "/sessions/" + sessionId + "/rules/" + ruleId,
          this.token
        )
      )
    );
  }

  checkForError(response: any) {
    if (response.statusCode >= 300) {
      throw new Error(response.statusCode + " - " + response.statusMessage);
    }
  }

  getFile(sessionId: string, datasetId: string, maxLength: number) {
    // Range request 0-0 would produce 416 - Range Not Satifiable
    if (maxLength === 0) {
      return of("");
    }

    return this.getFileBrokerUri().pipe(
      mergeMap((fileBrokerUri) => {
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
    if (!this.services) {
      let services$;
      if (this.isClient) {
        // client
        services$ = this.getServicesUncached();
      } else {
        // server
        services$ = this.getInternalServices();
      }
      return services$.pipe(tap((services) => (this.services = services)));
    } else {
      return of(this.services);
    }
  }

  /**
   * write help and progress message on normal verbosity level
   */
  info(msg: string) {
    if (!this.isQuiet) {
      logger.info("get public services from " + this.serviceLocatorUri);
    }
  }

  getServicesUncached() {
    this.info("get public services from " + this.serviceLocatorUri);
    return this.getJson(this.serviceLocatorUri + "/services", null).pipe(
      tap((services) => (this.services = services))
    );
  }

  getInternalServices() {
    this.info("get internal services from " + this.serviceLocatorUri);
    return this.getJson(
      this.serviceLocatorUri + "/services/internal",
      this.token
    );
  }

  getInternalAuthUri(username: string, password: string) {
    this.info("get internal auth address from " + this.serviceLocatorUri);
    return this.get(
      this.serviceLocatorUri + "/services/internal",
      this.getBasicAuthHeader(username, password)
    ).pipe(
      map((data: string | null) => {
        if (data != null) {
          return JSON.parse(data);
        } else {
          throw new Error("response is null");
        }
      }),
      map((services: Service[]) => {
        let auths = services.filter((s) => s.role === "auth").map((s) => s.uri);
        if (auths.length > 0) {
          return auths[0];
        }
        throw new Error("not auths found");
      })
    );
  }

  getServiceUri(serviceName: string) {
    return this.getServices().pipe(
      map((services: Service[]) => {
        let service = services.filter(
          (service) => service.role === serviceName
        )[0];
        if (!service) {
          observableThrowError(
            new errors.InternalServerError("service not found" + serviceName)
          );
        }

        return this.isClient ? service.publicUri : service.uri;
      })
    );
  }

  getServiceLocator(webServer: string) {
    return this.request("GET", webServer + "/assets/conf/chipster.yaml").pipe(
      map((resp) => {
        let body = this.handleResponse(resp);
        if (body != null) {
          let conf = YAML.parse(body);
          return conf["service-locator"];
        } else {
          return null;
        }
      })
    );
  }

  getHttp(uri: string) {
    if (uri.startsWith("https://")) {
      return https;
    } else {
      return http;
    }
  }

  request(
    method: string,
    uri: string,
    headers?: Object,
    body?: string
  ): Observable<HttpResponse> {
    let subject = new Subject<HttpResponse>();

    let httpLib = this.getHttp(uri);

    const httpOptions: any = {
      method: method,
      headers: headers,
    };

    const req = httpLib.request(uri, httpOptions, (res: IncomingMessage) => {
      let body = "";

      res.on("data", (d) => {
        body += d;
      });

      res.on("end", () => {
        subject.next({
          uri: uri,
          response: res,
          body: body,
        });
        subject.complete();
      });
    });

    req.on("error", (error: Error) => {
      subject.error(error);
    });

    if (body) {
      req.write(body);
    }
    req.end();
    return subject;
  }

  getToFile(uri: string, file: string) {
    let subject = new Subject<any>();

    let httpLib = this.getHttp(uri);

    let httpOptions = {
      headers: this.getBasicAuthHeader("token", this.token),
      method: "GET",
    };

    const req = httpLib.request(uri, httpOptions);
    req.end();

    req.addListener("response", (response: ClientRequest) => {
      let error: any | null = null;
      let errorBody = "";

      try {
        this.checkForError(response);
      } catch (e) {
        error = e;
      }

      let writeStream: any = null;

      /* Read the response body in case there was an error

      Error responses are small, so it should be fine to read them without backpressure (see the comment about pipe below).
      */
      response.addListener("data", (chunk) => {
        if (error) {
          errorBody += chunk.toString();
        }
      });

      writeStream = this.getWriteStream(file);

      response.addListener("end", () => {
        if (writeStream) {
          writeStream.end();
        }
        if (error) {
          subject.error(
            this.responseToError({
              response: response,
              body: errorBody,
              uri: uri,
            })
          );
        } else {
          subject.next(null);
          subject.complete();
        }
      });

      response.on("error", (error) => {
        subject.error(error);
      });

      /* Read the normal responses with pipe

      Writing the chunks one by one in .addListener('data', ...) would not be a good idea, because we would
      run out of memory when the writing side is slower. Pipe implements backpressure to slow down the reading.
      */
      response.pipe(writeStream);
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

    return this.getFileBrokerUri().pipe(
      mergeMap((fileBrokerUri) => {
        // s3-storage needs file size at the moment
        let fileSize = fs.statSync(file).size;

        const uri =
          fileBrokerUri +
          "/sessions/" +
          sessionId +
          "/datasets/" +
          datasetId +
          "?flowTotalSize=" +
          fileSize;

        let httpLib = this.getHttp(uri);

        let httpOptions = {
          headers: this.getBasicAuthHeader("token", this.token),
          method: "PUT",
        };

        const req = httpLib.request(uri, httpOptions);

        this.getReadStream(file).pipe(req);
        // fs.createReadStream(file).pipe(req);

        req.addListener("response", (response: ClientRequest) => {
          let error: any = null;
          let body = "";

          try {
            this.checkForError(response);
          } catch (e) {
            error = e;
          }

          response.addListener("data", (chunk) => {
            body += chunk.toString();
          });

          response.addListener("end", () => {
            req.end();
            if (error) {
              subject.error(
                this.responseToError({
                  response: response,
                  body: body,
                  uri: uri,
                })
              );
            } else {
              subject.next(datasetId);
              subject.complete();
            }
          });

          response.on("error", (error) => {
            subject.error(error);
          });
        });
        return subject;
      })
    );
  }

  getJson(uri: string, token: string | null): Observable<any> {
    return this.getWithToken(uri, token).pipe(
      map((data) => {
        if (data != null) {
          return JSON.parse(data);
        } else {
          return null;
        }
      })
    );
  }

  getWithToken(
    uri: string,
    token: string | null,
    headers?: Object
  ): Observable<string | null> {
    if (token) {
      return this.get(uri, this.getBasicAuthHeader("token", token, headers));
    } else {
      return this.get(uri, headers);
    }
  }

  getBasicAuthHeader(username: string, password: string, headers?: any) {
    if (!headers) {
      headers = {};
    }

    headers["Authorization"] =
      "Basic " + Buffer.from(username + ":" + password).toString("base64");

    return headers;
  }

  get(uri: string, headers?: Object): Observable<string | null> {
    let options = {
      headers: headers,
    };

    logger.debug("get()", uri + " " + JSON.stringify(options.headers));

    return this.request("GET", uri, headers).pipe(
      catchError((err) => {
        throw this.requestError("GET", uri, err);
      }),
      map((data) => this.handleResponse(data))
    );
  }

  post(
    uri: string,
    headers?: Object,
    body?: string
  ): Observable<string | null> {
    let options = {
      headers: headers,
      body: body,
    };
    logger.debug("post()", uri + " " + JSON.stringify(options.headers));
    return this.request("POST", uri, headers, body).pipe(
      catchError((err) => {
        throw this.requestError("POST", uri, err);
      }),
      map((data) => this.handleResponse(data))
    );
  }

  put(uri: string, headers?: Object, body?: string): Observable<string | null> {
    logger.debug("put()", uri + " " + JSON.stringify(headers));
    return this.request("PUT", uri, headers, body).pipe(
      catchError((err) => {
        throw this.requestError("PUT", uri, err);
      }),
      map((data) => this.handleResponse(data))
    );
  }

  postJson(uri: string, token: string, data: any): Observable<string | null> {
    let headers = this.getBasicAuthHeader("token", token);
    headers["content-type"] = "application/json";
    return this.post(uri, headers, JSON.stringify(data));
  }

  putJson(uri: string, token: string, data: any): Observable<string | null> {
    let headers = this.getBasicAuthHeader("token", token);
    headers["content-type"] = "application/json";
    return this.put(uri, headers, JSON.stringify(data));
  }

  deleteWithToken(uri: string, token: string) {
    return this.delete(uri, this.getBasicAuthHeader("token", token));
  }

  delete(uri: string, headers?: Object): Observable<any> {
    logger.debug("delete()", uri + " " + JSON.stringify(headers));
    return this.request("DELETE", uri, headers).pipe(
      catchError((err) => {
        throw this.requestError("DELETE", uri, err);
      }),
      map((data) => this.handleResponse(data))
    );
  }

  // connection errors, like "socket hang up"
  requestError(method: string, uri: string, err: Error): Error {
    const msg = "request failed: " + method + " " + uri + " " + err;
    logger.error(msg);
    return new errors.RestError(msg);
  }

  handleResponse(data: HttpResponse): string | null {
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
        throw this.responseToError(data);
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

  responseToError(httpResponse: HttpResponse) {
    let statusCode;
    let statusMessage;
    let body;
    let uri;

    if (httpResponse) {
      uri = httpResponse.uri;
      body = httpResponse.body;
      if (httpResponse.response) {
        statusCode = httpResponse.response.statusCode;
        statusMessage = httpResponse.response.statusMessage;
      }
    }

    let message = statusCode + " - " + statusMessage + " (" + body + ") " + uri;

    return new errors.HttpError(
      {
        statusCode: statusCode,
        info: {
          httpResponse: httpResponse,
        },
      },
      message
    );
  }
}

export class HttpResponse {
  response: any;
  body: string | null = null;
  uri: string | null = null;
}
