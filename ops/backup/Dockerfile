FROM postgres:18-trixie

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends awscli ca-certificates python3 \
    && rm -rf /var/lib/apt/lists/*

COPY --chmod=0555 ops/backup/backup.sh ops/backup/connection.py /opt/backup/
USER postgres
ENTRYPOINT ["timeout", "--signal=TERM", "--kill-after=10s", "30m", "/opt/backup/backup.sh"]
