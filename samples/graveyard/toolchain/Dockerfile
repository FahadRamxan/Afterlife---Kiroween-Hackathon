# syntax=docker/dockerfile:1.7
# Afterlife DOS toolchain: Open Watcom v2 (16-bit DOS C compiler), DOSBox (to run the EXEs
# headless), faketime (DOSBox 0.74 has no DATE command, so the DOS clock comes from a faked host
# clock) and gcc (to unit test the C helpers on the host too).
# Used through `pnpm graveyard:build` and `pnpm graveyard:test`, never directly.
FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends dosbox faketime gcc libc6-dev make xz-utils ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Pinned dated release (not the rolling Current-build), verified by checksum.
ADD --checksum=sha256:89e90b7544cf3ea4a38124ec4c104a5027f31101405d7115c3f833daa465bb48 \
  https://github.com/open-watcom/open-watcom-v2/releases/download/2026-11-01-Build/ow-snapshot.tar.xz \
  /tmp/ow.tar.xz
RUN mkdir -p /opt/watcom && tar -xJf /tmp/ow.tar.xz -C /opt/watcom && rm /tmp/ow.tar.xz

ENV WATCOM=/opt/watcom
ENV PATH=/opt/watcom/binl64:$PATH
ENV INCLUDE=/opt/watcom/h
ENV EDPATH=/opt/watcom/eddat
# DOSBox without a display or sound card.
ENV SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy

WORKDIR /graveyard
