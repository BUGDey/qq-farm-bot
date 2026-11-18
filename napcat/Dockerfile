# NapCat 基础镜像。
#
# 部分版本在直连仓库不可用，默认使用加速前缀；缓存和完整层是否可拉以实际 pull 为准。
# 想换源就在 .env 里改 NAPCAT_IMAGE，例如：
#   NAPCAT_IMAGE=docker.m.daocloud.io/mlikiowa/napcat-docker:v4.18.42
#   NAPCAT_IMAGE=docker.1ms.run/mlikiowa/napcat-docker:v4.18.42
#   NAPCAT_IMAGE=docker.xuanyuan.me/mlikiowa/napcat-docker:v4.18.42
# 本机已 docker load 过离线镜像时，写该镜像的 tag 即可（BuildKit 构建仍可能访问 registry）。
ARG NAPCAT_IMAGE=docker.m.daocloud.io/mlikiowa/napcat-docker:v4.18.42
FROM ${NAPCAT_IMAGE}

COPY napcat/plugins/qq-miniapp-openauth /opt/qq-farm-bot/qq-miniapp-openauth
COPY napcat/docker-entrypoint.sh /usr/local/bin/qq-farm-napcat-entrypoint

RUN chmod +x /usr/local/bin/qq-farm-napcat-entrypoint

ENTRYPOINT ["/usr/local/bin/qq-farm-napcat-entrypoint"]
