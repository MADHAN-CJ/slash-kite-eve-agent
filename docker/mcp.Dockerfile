# Local-dev image for the /markets Kite MCP (plan §10 local stack). The MCP's
# script runner executes ONLY on Linux inside bubblewrap (>= 0.8, for
# --disable-userns), so on a Mac the sibling checkout runs in this container.
# The source is bind-mounted at /src by docker-compose (not copied): edits in
# ../zap-kite-mcp/mcp are picked up on the next `docker compose restart mcp`.
# Ubuntu 24.04 ships bubblewrap 0.9; Python comes from uv's standalone builds so
# the interpreter prefix is a clean tree the sandbox can mount read-only.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive \
    UV_PYTHON_INSTALL_DIR=/opt/uv-python \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    PATH=/root/.local/bin:/opt/venv/bin:$PATH
RUN apt-get update \
 && apt-get install -y --no-install-recommends bubblewrap ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && curl -LsSf https://astral.sh/uv/install.sh | sh \
 && uv python install 3.12 \
 && bwrap --version
WORKDIR /src
# Dependencies are synced at container start from the mounted lockfile (see compose `command`).
EXPOSE 8029
