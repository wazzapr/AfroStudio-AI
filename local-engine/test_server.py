"""Small regression tests for the local engine's HTTP API."""
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch

import server


class EngineApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def get_json(self, path):
        with urlopen(self.base + path, timeout=2) as response:
            return json.loads(response.read().decode("utf-8"))

    def test_health_reports_bridge_version(self):
        result = self.get_json("/health")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["version"], "0.2.0")

    @patch("server.probe_ace_step", return_value={"available": False, "url": "http://127.0.0.1:8001", "message": "ACE-Step not detected"})
    def test_status_does_not_claim_generation_without_provider(self, _probe):
        result = self.get_json("/status")
        self.assertFalse(result["capabilities"]["music_generation"])
        self.assertFalse(result["model"]["ready"])

    def test_unknown_route_returns_404(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(self.base + "/not-a-route", timeout=2)
        self.assertEqual(error.exception.code, 404)

    def test_generate_rejects_empty_prompt(self):
        body = json.dumps({"prompt": ""}).encode("utf-8")
        request = Request(self.base + "/generate", data=body, headers={"Content-Type": "application/json"}, method="POST")
        with self.assertRaises(HTTPError) as error:
            urlopen(request, timeout=2)
        self.assertEqual(error.exception.code, 400)

    @patch("server.probe_ace_step", return_value={"available": False, "url": "http://127.0.0.1:8001", "message": "ACE-Step not detected"})
    def test_generate_returns_clear_error_when_provider_missing(self, _probe):
        body = json.dumps({"prompt": "warm organic Afro House"}).encode("utf-8")
        request = Request(self.base + "/generate", data=body, headers={"Content-Type": "application/json"}, method="POST")
        with self.assertRaises(HTTPError) as error:
            urlopen(request, timeout=2)
        self.assertEqual(error.exception.code, 503)
        result = json.loads(error.exception.read().decode("utf-8"))
        self.assertIn("ACE-Step", result["message"])


if __name__ == "__main__":
    unittest.main()
