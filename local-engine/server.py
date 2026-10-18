"""Local-only bridge from AfroStudio AI to an optional ACE-Step API.

This service never downloads model weights. Run ACE-Step separately if your PC can
support it, then point ACESTEP_API_URL at its local API (default port 8001).
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin, urlparse
from email.parser import BytesParser
from email.policy import default
from urllib.request import Request, urlopen
import json
import os
import threading
import time
import uuid

HOST = "127.0.0.1"
PORT = 7860
ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}
ACESTEP_API_URL = os.environ.get("ACESTEP_API_URL", "http://127.0.0.1:8001").rstrip("/")
TASKS = {}
TASKS_LOCK = threading.Lock()
MAX_PROMPT_LENGTH = 2000
MAX_REFERENCE_BYTES = 25 * 1024 * 1024


def json_request(url, payload=None, timeout=5):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = Request(url, data=data, headers=headers, method="GET" if data is None else "POST")
    with urlopen(request, timeout=timeout) as response:
        result = json.loads(response.read().decode("utf-8"))
    if not isinstance(result, dict) or result.get("code", 200) not in (200, None):
        raise RuntimeError(str(result.get("error", "ACE-Step returned an unexpected response.")) if isinstance(result, dict) else "Invalid ACE-Step response.")
    return result.get("data", result)


def probe_ace_step():
    try:
        data = json_request(ACESTEP_API_URL + "/health", timeout=1.5)
        return {"available": True, "url": ACESTEP_API_URL, "message": "ACE-Step API is reachable. Model readiness still depends on ACE-Step itself."}
    except Exception:
        return {"available": False, "url": ACESTEP_API_URL, "message": "ACE-Step API not detected on the configured local address."}



def multipart_request(url, fields, file_field, file_name, file_bytes, file_type):
    boundary = '----AfroStudioBoundary' + uuid.uuid4().hex
    chunks = []
    for key, value in fields.items():
        chunks.extend([('--' + boundary + '\r\n').encode(), ('Content-Disposition: form-data; name="' + key + '"\r\n\r\n').encode(), str(value).encode('utf-8'), b'\r\n'])
    safe_name = os.path.basename(file_name).replace('"', '')
    chunks.extend([('--' + boundary + '\r\n').encode(), ('Content-Disposition: form-data; name="' + file_field + '"; filename="' + safe_name + '"\r\n').encode(), ('Content-Type: ' + file_type + '\r\n\r\n').encode(), file_bytes, b'\r\n', ('--' + boundary + '--\r\n').encode()])
    request = Request(url, data=b''.join(chunks), headers={'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Accept': 'application/json'}, method='POST')
    with urlopen(request, timeout=60) as response:
        result = json.loads(response.read().decode('utf-8'))
    if not isinstance(result, dict) or result.get('code', 200) not in (200, None):
        raise RuntimeError(str(result.get('error', 'ACE-Step returned an unexpected response.')) if isinstance(result, dict) else 'Invalid ACE-Step response.')
    return result.get('data', result)

def generation_worker(task_id, prompt, bpm, duration, reference_bytes=None, reference_name='reference.wav', reference_type='audio/wav', style_influence=0.55):
    try:
        fields = {
            "prompt": prompt, "bpm": bpm, "audio_duration": duration, "audio_format": "wav",
            "model": "acestep-v15-turbo", "thinking": False, "batch_size": 1, "inference_steps": 8,
        }
        if reference_bytes:
            fields.update({
                "task_type": "cover",
                "instruction": "Create a new, original Afro House track inspired by the broad production style, energy, percussion feel and mood of the uploaded reference. Do not reproduce the original melody or lyrics.",
                "audio_cover_strength": max(0.2, min(0.8, 1.0 - style_influence)),
            })
            submitted = multipart_request(ACESTEP_API_URL + "/release_task", fields, "src_audio", reference_name, reference_bytes, reference_type)
        else:
            submitted = json_request(ACESTEP_API_URL + "/release_task", fields, timeout=20)
        provider_task_id = submitted.get("task_id") if isinstance(submitted, dict) else None
        if not provider_task_id:
            raise RuntimeError("ACE-Step did not return a task ID.")
        with TASKS_LOCK:
            TASKS[task_id]["provider_task_id"] = provider_task_id
            TASKS[task_id]["status"] = "running"
            TASKS[task_id]["message"] = "ACE-Step is generating audio…"
        timeout_seconds = max(1200, duration * 20)
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            result_data = json_request(ACESTEP_API_URL + "/query_result", {"task_id_list": [provider_task_id]}, timeout=15)
            entries = result_data if isinstance(result_data, list) else result_data.get("data", [])
            if isinstance(entries, dict):
                entries = [entries]
            entry = next((item for item in entries if isinstance(item, dict) and item.get("task_id") == provider_task_id), None)
            if entry is None:
                time.sleep(3)
                continue
            status = entry.get("status", 0)
            if status == 2:
                raise RuntimeError(str(entry.get("error") or "ACE-Step generation failed."))
            if status == 1:
                raw_result = entry.get("result", [])
                if isinstance(raw_result, str):
                    raw_result = json.loads(raw_result)
                if isinstance(raw_result, dict):
                    raw_result = [raw_result]
                audio_item = next((item for item in raw_result if isinstance(item, dict) and item.get("file")), None) if isinstance(raw_result, list) else None
                if not audio_item:
                    raise RuntimeError("ACE-Step finished but did not return an audio file.")
                file_url = audio_item["file"]
                if file_url.startswith("/"):
                    file_url = ACESTEP_API_URL + file_url
                elif not file_url.startswith(("http://", "https://")):
                    file_url = urljoin(ACESTEP_API_URL + "/", file_url)
                parsed = urlparse(file_url)
                if parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
                    raise RuntimeError("Refusing to download audio from a non-local host.")
                with urlopen(Request(file_url, headers={"Accept": "audio/*"}), timeout=90) as response:
                    audio_bytes = response.read()
                if not audio_bytes:
                    raise RuntimeError("ACE-Step returned an empty audio file.")
                with TASKS_LOCK:
                    TASKS[task_id].update({"status": "succeeded", "message": "Audio generated.", "audio": audio_bytes, "content_type": response.headers.get("Content-Type", "audio/wav")})
                return
            time.sleep(3)
        raise RuntimeError(f"ACE-Step generation timed out after {timeout_seconds // 60} minutes.")
    except (HTTPError, URLError, TimeoutError, ValueError, RuntimeError, OSError) as error:
        with TASKS_LOCK:
            TASKS[task_id].update({"status": "failed", "message": str(error)[:500]})


class Handler(BaseHTTPRequestHandler):
    server_version = "AfroStudioLocalEngine/0.2"

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        origin = self.headers.get("Origin", "")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def _send_audio(self, task):
        body = task["audio"]
        self.send_response(200)
        self.send_header("Content-Type", task.get("content_type", "audio/wav"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Disposition", 'attachment; filename="afrostudio-generated.wav"')
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        origin = self.headers.get("Origin", "")
        self.send_response(204)
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Vary", "Origin")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"status": "ok", "service": "afrostudio-local-engine", "version": "0.2.0"})
        elif self.path == "/status":
            provider = probe_ace_step()
            self._send_json(200, {
                "status": "ok",
                "service": "afrostudio-local-engine",
                "model": {"installed": None, "ready": False, "name": "ACE-Step 1.5 API (model readiness unverified)" if provider["available"] else None},
                "provider": provider,
                "capabilities": {"health_check": True, "music_generation": provider["available"], "reference_audio_upload": True},
                "message": "ACE-Step API is reachable; model readiness is not verified until a generation succeeds." if provider["available"] else "Bridge is running; start a compatible local ACE-Step API to enable AI audio generation."
            })
        elif self.path.startswith("/tasks/"):
            task_id = self.path.split("/", 2)[2]
            with TASKS_LOCK:
                task = TASKS.get(task_id)
                if task is None:
                    self._send_json(404, {"status": "error", "message": "Unknown generation task."})
                else:
                    self._send_json(200, {"task_id": task_id, "status": task["status"], "message": task["message"], "audio_url": "/audio/" + task_id if task["status"] == "succeeded" else None})
        elif self.path.startswith("/audio/"):
            task_id = self.path.split("/", 2)[2]
            with TASKS_LOCK:
                task = TASKS.get(task_id)
                if not task or task.get("status") != "succeeded" or not task.get("audio"):
                    self._send_json(404, {"status": "error", "message": "Generated audio is not ready."})
                else:
                    self._send_audio(task)
        else:
            self._send_json(404, {"status": "error", "message": "Unknown endpoint. Try /health or /status."})

    def do_POST(self):
        if self.path != '/generate':
            self._send_json(404, {'status': 'error', 'message': 'Unknown endpoint. Use POST /generate.'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > MAX_REFERENCE_BYTES + 20000:
                self._send_json(400, {'status': 'error', 'message': 'Request is empty or exceeds the 25 MB reference-audio limit.'})
                return
            raw_body = self.rfile.read(length)
            content_type = self.headers.get('Content-Type', '')
            reference_bytes = None
            reference_name = 'reference.wav'
            reference_type = 'audio/wav'
            if content_type.lower().startswith('multipart/form-data'):
                message = BytesParser(policy=default).parsebytes(('MIME-Version: 1.0\r\nContent-Type: ' + content_type + '\r\n\r\n').encode('utf-8') + raw_body)
                payload = {}
                if message.is_multipart():
                    for part in message.iter_parts():
                        name = part.get_param('name', header='content-disposition')
                        if not name:
                            continue
                        value = part.get_payload(decode=True) or b''
                        filename = part.get_filename()
                        if filename and name in ('reference_audio', 'src_audio'):
                            if len(value) > MAX_REFERENCE_BYTES:
                                self._send_json(413, {'status': 'error', 'message': 'Reference audio exceeds the 25 MB limit.'})
                                return
                            reference_bytes = value
                            reference_name = os.path.basename(filename)
                            reference_type = part.get_content_type() or 'application/octet-stream'
                        elif not filename:
                            payload[name] = value.decode('utf-8', errors='replace')
            else:
                payload = json.loads(raw_body.decode('utf-8'))
            if not isinstance(payload, dict):
                raise ValueError('Request body must be a JSON object.')
            prompt = payload.get('prompt', '')
            if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > MAX_PROMPT_LENGTH:
                self._send_json(400, {'status': 'error', 'message': 'Prompt must contain 1–2000 characters.'})
                return
            try:
                bpm = max(30, min(300, int(payload.get('bpm', 122))))
                duration = max(10, min(180, int(payload.get('duration', 30))))
                style_influence = max(0.0, min(1.0, float(payload.get('style_influence', 0.55))))
            except (TypeError, ValueError):
                self._send_json(400, {'status': 'error', 'message': 'BPM, duration, and style influence must be numbers.'})
                return
            provider = probe_ace_step()
            if not provider['available']:
                self._send_json(503, {'status': 'error', 'message': provider['message'], 'provider_url': ACESTEP_API_URL})
                return
            task_id = str(uuid.uuid4())
            with TASKS_LOCK:
                TASKS[task_id] = {'status': 'queued', 'message': 'Waiting for ACE-Step…', 'audio': None}
            args = (task_id, prompt.strip(), bpm, duration, reference_bytes, reference_name, reference_type, style_influence)
            threading.Thread(target=generation_worker, args=args, daemon=True).start()
            self._send_json(202, {'task_id': task_id, 'status': 'queued', 'message': 'Generation task accepted.', 'reference_used': bool(reference_bytes)})
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
            self._send_json(400, {'status': 'error', 'message': str(error)})
        except (BrokenPipeError, ConnectionResetError):
            return

    def log_message(self, format_string, *args):
        print("[AfroStudio engine] " + (format_string % args))


if __name__ == "__main__":
    print(f"AfroStudio local engine bridge listening on http://{HOST}:{PORT}")
    print(f"Optional ACE-Step API: {ACESTEP_API_URL}")
    print("Without ACE-Step, the bridge reports status but cannot generate music.")
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except OSError as error:
        raise SystemExit(f"Could not start local engine bridge: {error}")
