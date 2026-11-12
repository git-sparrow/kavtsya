import os
import re
import sys
from urllib.parse import parse_qsl, unquote, urlsplit

uri = urlsplit(os.environ["DATABASE_URL"])
if uri.scheme not in ("postgres", "postgresql") or not uri.hostname or uri.fragment:
    sys.exit(1)
parameters = {
    "host": uri.hostname,
    "port": str(uri.port or 5432),
    "user": unquote(uri.username or ""),
    "password": unquote(uri.password or ""),
    "dbname": unquote(uri.path.removeprefix("/")),
    "connect_timeout": "15",
}
parameters.update(parse_qsl(uri.query, keep_blank_values=True, strict_parsing=True))
for key, value in parameters.items():
    if (
        not re.fullmatch(r"[a-z_]+", key)
        or any(c in value for c in "\r\n\0")
        or value != value.strip()
        or key in ("service", "servicefile")
    ):
        sys.exit(1)
if not parameters["user"] or not parameters["dbname"]:
    sys.exit(1)
with open(sys.argv[1], "x", encoding="utf-8") as service:
    service.write("[backup]\n")
    for key, value in parameters.items():
        service.write(f"{key}={value}\n")
