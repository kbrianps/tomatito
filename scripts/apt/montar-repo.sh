#!/usr/bin/env bash
# Monta o repositório APT do Tomatito (v0.3) a partir dos .deb de uma pasta.
#
#   bash scripts/apt/montar-repo.sh <pasta com os .deb> <pasta de saída>
#
# A saída é o que vai para https://kbrianps.github.io/tomatito/apt:
#
#   pool/main/t/tomatito/*.deb
#   dists/stable/main/binary-amd64/Packages(.gz)
#   dists/stable/Release, Release.gpg e InRelease
#   tomatito-archive-keyring.gpg   (a chave pública, a mesma do pacote)
#
# A assinatura usa a chave secreta do chaveiro do gpg (no CI, a do segredo
# APT_GPG_PRIVATE_KEY, importada antes). APT_GPG_KEY escolhe a chave, se o
# chaveiro tiver mais de uma. Precisa de dpkg-dev (dpkg-scanpackages),
# apt-utils (apt-ftparchive) e gpg.
set -euo pipefail

debs="${1:?uso: montar-repo.sh <pasta com os .deb> <pasta de saída>}"
saida="${2:?uso: montar-repo.sh <pasta com os .deb> <pasta de saída>}"
raiz="$(cd "$(dirname "$0")/../.." && pwd)"

shopt -s nullglob
arquivos=("$debs"/*.deb)
[ "${#arquivos[@]}" -gt 0 ] || { echo "nenhum .deb em $debs" >&2; exit 1; }

rm -rf "$saida"
mkdir -p "$saida/pool/main/t/tomatito" "$saida/dists/stable/main/binary-amd64"
cp "${arquivos[@]}" "$saida/pool/main/t/tomatito/"
cp "$raiz/packaging/apt/tomatito-archive-keyring.gpg" "$saida/"

cd "$saida"
dpkg-scanpackages --arch amd64 --multiversion pool > dists/stable/main/binary-amd64/Packages
gzip -9 -k -n dists/stable/main/binary-amd64/Packages

apt-ftparchive \
  -o APT::FTPArchive::Release::Origin=Tomatito \
  -o APT::FTPArchive::Release::Label=Tomatito \
  -o APT::FTPArchive::Release::Suite=stable \
  -o APT::FTPArchive::Release::Codename=stable \
  -o APT::FTPArchive::Release::Architectures=amd64 \
  -o APT::FTPArchive::Release::Components=main \
  -o "APT::FTPArchive::Release::Description=Tomatito, timer de foco" \
  release dists/stable > dists/stable/Release

chave=()
[ -n "${APT_GPG_KEY:-}" ] && chave=(--local-user "$APT_GPG_KEY")
gpg --batch --yes "${chave[@]}" --clearsign -o dists/stable/InRelease dists/stable/Release
gpg --batch --yes "${chave[@]}" --armor --detach-sign -o dists/stable/Release.gpg dists/stable/Release

echo "repositório em $saida:"
grep -E '^(Package|Version|Filename):' dists/stable/main/binary-amd64/Packages
