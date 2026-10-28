FROM docker.1ms.run/library/node:20-alpine AS builder

WORKDIR /app

ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
ENV npm_config_registry=https://registry.npmmirror.com

RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY core/package.json ./core/
COPY web/package.json ./web/

COPY core ./core
COPY web ./web

# 完整部署包（*-full.zip）已经带了构建好的 web/dist，
# 这里直接复用，不再装前端依赖、也不再重新构建；
# 只有源码包（没有 dist）才现场安装依赖并构建前端。
RUN if [ -f web/dist/index.html ]; then \
      echo "[build] 检测到预构建的 web/dist，跳过前端依赖安装与构建"; \
    else \
      echo "[build] 未找到 web/dist，安装依赖并构建前端"; \
      pnpm install --frozen-lockfile && pnpm build:web; \
    fi

# ==========================================
FROM docker.1ms.run/library/node:20-alpine AS prod-deps

WORKDIR /app

ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
ENV npm_config_registry=https://registry.npmmirror.com

RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY core/package.json ./core/
COPY web/package.json ./web/

RUN pnpm -C core install --prod --frozen-lockfile

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
