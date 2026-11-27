"""Hand-written core of the Motorical Python SDK. The operation table (_operations.py) and the methods (client.py) are
generated from openapi.json by packages/sdk-generator; this module turns one operation plus its arguments into a request.
Standard library only."""
import json
import re
import urllib.error
import urllib.parse
import urllib.request

from ._operations import OPERATIONS

DEFAULT_BASE_URL = "https://api.motorical.com"


class MotoricalError(Exception):
    """An API error. Branch on ``code`` (https://docs.motorical.com/api-reference/errors); quote ``request_id`` to support."""

    def __init__(self, status, code=None, message=None, request_id=None, body=None):
        super().__init__(message or code or "HTTP %s" % status)
        self.status = status
        self.code = code
        self.request_id = request_id
        self.body = body


def _camel(name):
    return re.sub(r"_([a-z])", lambda m: m.group(1).upper(), name)


def _pick(kwargs, name):
    """A parameter by its OpenAPI name or its snake_case spelling (webhookId or webhook_id); removed once read."""
    for key in (name, re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name).lower(), name.replace("-", "_").lower()):
        if key in kwargs:
            return kwargs.pop(key)
    return None


class BaseClient:
    def __init__(self, api_key=None, account_key=None, bearer_token=None, dashboard_token=None, workspace_id=None,
                 base_url=None, comms_base_url=None, timeout=30, user_agent="motorical-sdk-python"):
        self.api_key, self.account_key = api_key, account_key
        self.bearer_token, self.dashboard_token = bearer_token, dashboard_token
        self.workspace_id = workspace_id
        self.base_url, self.comms_base_url = base_url, comms_base_url
        self.timeout, self.user_agent = timeout, user_agent

    def _auth_header(self, kind):
        value = {"apiKey": self.api_key and "ApiKey " + self.api_key,
                 "accountKey": self.account_key and "ApiKey " + self.account_key,
                 "bearerToken": self.bearer_token and "Bearer " + self.bearer_token,
                 "dashboardToken": self.dashboard_token and "Bearer " + self.dashboard_token}.get(kind)
        return value or None

    def build_request(self, op_id, kwargs):
        op = OPERATIONS[op_id]
        kw = dict(kwargs)
        path = op["path"]
        for name in op["pathParams"]:
            value = _pick(kw, name)
            if value in (None, ""):
                raise TypeError("%s: missing path parameter %r" % (op_id, name))
            path = path.replace("{%s}" % name, urllib.parse.quote(str(value), safe=""))
        query = {}
        for q in op["query"]:
            value = _pick(kw, q["name"])
            if value is not None:
                query[q["name"]] = str(value).lower() if isinstance(value, bool) else str(value)
            elif q["required"]:
                raise TypeError("%s: missing query parameter %r" % (op_id, q["name"]))
        headers = {"Accept": "application/json", "User-Agent": self.user_agent}
        for h in op["headers"]:
            value = _pick(kw, h["name"])
            if value is not None:
                headers[h["name"]] = str(value)
            elif h["required"]:
                raise TypeError("%s: missing header %r" % (op_id, h["name"]))
        for kind in op["auth"]:
            if kind != "workspace" and self._auth_header(kind):
                headers["Authorization"] = self._auth_header(kind)
                break
        if "workspace" in op["auth"]:
            ws = kw.pop("workspace_id", None) or kw.pop("workspaceId", None) or self.workspace_id
            if not ws:
                raise TypeError("%s: needs a Communications workspace id (workspace_id)" % op_id)
            headers["X-Tenant-Id"] = str(ws)
            if "Authorization" not in headers:
                auth = self._auth_header("accountKey") or self._auth_header("dashboardToken")
                if auth:
                    headers["Authorization"] = auth
        data = None
        if op["body"]:
            body = kw.pop("body", None)
            if body is None and op["bodyRequired"]:
                raise TypeError("%s: missing body" % op_id)
            if body is not None:
                data = json.dumps(body).encode("utf-8")
                headers["Content-Type"] = "application/json"
        base = (self.comms_base_url or op["server"]) if op["server"] else (self.base_url or DEFAULT_BASE_URL)
        url = base.rstrip("/") + path + ("?" + urllib.parse.urlencode(query) if query else "")
        return op["method"], url, headers, data

    def _call(self, op_id, kwargs):
        method, url, headers, data = self.build_request(op_id, kwargs)
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return _parse(res.read())
        except urllib.error.HTTPError as err:
            body = _parse(err.read())
            b = body if isinstance(body, dict) else {}
            raise MotoricalError(err.code, b.get("code"), b.get("message") or b.get("error"),
                                 b.get("requestId") or err.headers.get("X-Request-Id"), body) from None


def _parse(raw):
    text = raw.decode("utf-8") if raw else ""
    try:
        return json.loads(text) if text else None
    except ValueError:
        return text
