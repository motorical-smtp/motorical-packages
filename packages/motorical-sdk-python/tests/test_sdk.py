"""Every operation, called through the SDK against a local server: method, path, query, body and auth are checked."""
import json
import re
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from motorical import Motorical, MotoricalError, OPERATIONS  # noqa: E402
from motorical.client import Motorical as Generated  # noqa: E402

EXPECT = {"apiKey": "ApiKey mk_live_K", "accountKey": "ApiKey ak_live_A", "bearerToken": "Bearer BEARER", "dashboardToken": "Bearer DASH"}


def snake(op_id):
    return re.sub(r"([A-Z])([A-Z][a-z])", r"\1_\2", re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", op_id)).lower()


class Recorder(BaseHTTPRequestHandler):
    seen = []
    reply = (200, {"success": True}, {})

    def _handle(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode() if length else ""
        Recorder.seen.append({"method": self.command, "path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()}, "body": body})
        status, payload, extra = Recorder.reply
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        for k, v in extra.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = _handle

    def log_message(self, *args):
        pass


class SdkTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = HTTPServer(("127.0.0.1", 0), Recorder)
        cls.url = "http://127.0.0.1:%d" % cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def test_every_operation_has_a_method(self):
        for op_id in OPERATIONS:
            self.assertTrue(callable(getattr(Generated, snake(op_id), None)), op_id)

    def test_all_operations_build_the_right_request(self):
        Recorder.reply = (200, {"success": True}, {})
        m = Motorical(api_key="mk_live_K", account_key="ak_live_A", bearer_token="BEARER", dashboard_token="DASH",
                      workspace_id="ws_1", base_url=self.url, comms_base_url=self.url)
        for op_id, op in OPERATIONS.items():
            kw = {p: "v_" + p for p in op["pathParams"]}
            kw.update({q["name"]: "q_" + q["name"] for q in op["query"] if q["required"]})
            kw.update({h["name"]: "h_" + h["name"] for h in op["headers"] if h["required"]})
            if op["body"]:
                kw["body"] = {"probe": op_id}
            self.assertEqual(getattr(m, snake(op_id))(**kw), {"success": True}, op_id)
            r = Recorder.seen[-1]
            self.assertEqual(r["method"], op["method"], op_id)
            path = op["path"]
            for p in op["pathParams"]:
                path = path.replace("{%s}" % p, "v_" + p)
            self.assertEqual(r["path"].split("?")[0], path, op_id)
            if op["body"]:
                self.assertEqual(json.loads(r["body"]), {"probe": op_id}, op_id)
            first = next((k for k in op["auth"] if k != "workspace"), None)
            if first:
                self.assertEqual(r["headers"].get("authorization"), EXPECT[first], op_id)
            if "workspace" in op["auth"]:
                self.assertEqual(r["headers"].get("x-tenant-id"), "ws_1", op_id)
                self.assertEqual(r["headers"].get("authorization"), EXPECT["accountKey"], op_id)
            if not op["auth"]:
                self.assertIsNone(r["headers"].get("authorization"), op_id)

    def test_snake_case_parameter_names_work(self):
        Recorder.reply = (200, {"success": True}, {})
        m = Motorical(bearer_token="BEARER", base_url=self.url)
        m.get_webhook_stats(id="mb", webhook_id="wh")
        self.assertEqual(Recorder.seen[-1]["path"].split("?")[0], "/api/public/v1/motor-blocks/mb/webhooks/wh/stats")

    def test_errors_carry_code_and_request_id(self):
        Recorder.reply = (401, {"success": False, "code": "api_key_required", "error": "API key required", "requestId": "req_body"}, {"X-Request-Id": "req_hdr"})
        m = Motorical(base_url=self.url)
        with self.assertRaises(MotoricalError) as ctx:
            m.send_email(body={})
        self.assertEqual((ctx.exception.status, ctx.exception.code, ctx.exception.request_id), (401, "api_key_required", "req_body"))

    def test_missing_path_parameter_is_refused(self):
        with self.assertRaises(TypeError):
            Motorical(base_url=self.url).get_overview()


if __name__ == "__main__":
    unittest.main()
