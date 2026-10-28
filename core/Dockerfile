# ==========================================
# 公共底座：安装 pnpm
#
# 不再使用 corepack —— 它每次构建都要去镜像源拉 pnpm 本体，源一挂构建直接失败
# （典型报错：Error when performing the request to https://registry.npmmirror.com/pnpm/...）。
# 这里改用 npm 安装 pnpm，并支持「多个镜像源依次重试」，任一个可用即可。
#
# 需要改源时：
#   docker compose build --build-arg NPM_REGISTRY=https://registry.npmjs.org
# 或在 .env 里写 NPM_REGISTRY=... 后重新 ./start.sh
# ==========================================
FROM docker.1ms.run/library/node:20-alpine AS pnpm-base

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG NPM_REGISTRY_FALLBACK=https://registry.npmjs.org

ENV npm_config_registry=${NPM_REGISTRY}

COPY package.json ./

RUN set -eu; \
    ver="$(node -p "(require('./package.json').packageManager || 'pnpm@10.30.2').replace(/^pnpm@/, '')")"; \
    echo "[build] 需要 pnpm ${ver}"; \
    installed=""; \
    for reg in ${NPM_REGISTRY} ${NPM_REGISTRY_FALLBACK}; do \
      [ -n "${reg}" ] || continue; \
      attempt=1; \
      while [ "${attempt}" -le 3 ]; do \
        echo "[build] 从 ${reg} 安装 pnpm@${ver}（第 ${attempt}/3 次）"; \
        if npm install -g "pnpm@${ver}" --registry="${reg}" --no-audit --no-fund --loglevel=error; then \
          installed="${reg}"; \
          break; \
        fi; \
        attempt=$((attempt + 1)); \
        sleep 3; \
      done; \
      if [ -n "${installed}" ]; then break; fi; \
      echo "[build] ${reg} 不可用，换下一个镜像源"; \
    done; \
    if [ -z "${installed}" ]; then \
      echo "[build][错误] 所有镜像源都装不上 pnpm，请用 --build-arg NPM_REGISTRY=<可用源> 指定镜像源"; \
      exit 1; \
    fi; \
    echo "[build] pnpm 就绪，依赖将使用镜像源 ${installed}"; \
    printf '%s' "${installed}" > /tmp/npm_registry; \
    pnpm --version

# ==========================================
# 构建产物：源码包在这里安装依赖并构建前端
# ==========================================
FROM pnpm-base AS builder

COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY core/package.json ./core/
COPY web/package.json ./web/

COPY core ./core
COPY web ./web

# 完整部署包（*-full.zip）已经带了构建好的 web/dist，
# 这里直接复用，不再装前端依赖、也不再重新构建；
# 只有源码包（没有 dist）才现场安装依赖并构建前端。
RUN set -eu; \
    reg="$(cat /tmp/npm_registry)"; \
    if [ -f web/dist/index.html ]; then \
      echo "[build] 检测到预构建的 web/dist，跳过前端依赖安装与构建"; \
    else \
      echo "[build] 未找到 web/dist，安装依赖并构建前端"; \
      pnpm install --frozen-lockfile --registry="${reg}" --fetch-retries=5 && pnpm build:web; \
    fi

# ==========================================
# 生产依赖：只装 core 的 dependencies
# ==========================================
FROM pnpm-base AS prod-deps

COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY core/package.json ./core/
COPY web/package.json ./web/

RUN set -eu; \
    reg="$(cat /tmp/npm_registry)"; \
    pnpm -C core install --prod --frozen-lockfile --registry="${reg}" --fetch-retries=5

# ==========================================

FROM docker.1ms.run/library/node:20-alpine AS runner

WORKDIR /app/core

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

COPY --from=prod-deps /app/node_modules ../node_modules/
COPY --from=prod-deps /app/core/node_modules ./node_modules/
COPY --from=prod-deps /app/package.json ../package.json

COPY --from=builder /app/core ./
COPY --from=builder /app/web/dist ../web/dist

RUN mkdir -p data/logs && chmod -R 755 data

VOLUME ["/app/core/data"]

EXPOSE 3007 18000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:3007/api/status || exit 1

CMD ["node", "client.js"]