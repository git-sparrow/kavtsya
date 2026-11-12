"""Local TLS PUT/HEAD byte store; deliberately does not implement R2 authorization."""

import hashlib
import http.server
import io
import pathlib
import ssl

store = pathlib.Path("/tmp/objects")
store.mkdir()


def read_chunks(stream):
    chunks = []
    while True:
        size = int(stream.readline().split(b";", 1)[0], 16)
        if size == 0:
            while trailer := stream.readline():
                if trailer == b"\r\n":
                    return b"".join(chunks)
            raise ValueError("Missing chunk trailer terminator")
        chunks.append(stream.read(size))
        if stream.read(2) != b"\r\n":
            raise ValueError("Invalid chunk framing")


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        pass

    def object_file(self):
        return store / hashlib.sha256(self.path.encode()).hexdigest()

    def do_PUT(self):
        if self.headers.get("Transfer-Encoding") == "chunked":
            data = read_chunks(self.rfile)
        else:
            data = self.rfile.read(int(self.headers["Content-Length"]))
        if self.headers.get("Content-Encoding") == "aws-chunked":
            data = read_chunks(io.BytesIO(data))
        if len(data) != int(self.headers.get("X-Amz-Decoded-Content-Length", len(data))):
            raise ValueError("Decoded object length differs")
        self.object_file().write_bytes(data)
        self.send_response(200)
        self.send_header("ETag", '"standin"')
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        file = self.object_file()
        if not file.exists():
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Length", str(file.stat().st_size))
        self.send_header("ETag", '"standin"')
        self.end_headers()


server = http.server.HTTPServer(("0.0.0.0", 443), Handler)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain("/tmp/server.crt", "/tmp/server.key")
server.socket = context.wrap_socket(server.socket, server_side=True)
server.serve_forever()
