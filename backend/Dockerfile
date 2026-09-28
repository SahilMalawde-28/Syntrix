FROM python:3.10-slim

# System tools Ansible needs to reach lab PCs over SSH/WinRM.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client \
    sshpass \
    git \
    curl \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Everything — server.py, main.py, controllers/, primitives/, utils/,
# playbooks/, ansible.cfg — lives in this one backend/ folder now, so one
# COPY brings it all in. docker-compose.yml also bind-mounts "." over this
# at runtime, so editing any of these files locally doesn't require a
# rebuild — this COPY just makes sure a fresh image works standalone too.
COPY . .

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]