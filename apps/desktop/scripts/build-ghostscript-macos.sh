#!/usr/bin/env bash
# Build Ghostscript for macOS into vendor/ghostscript/, laid out like the
# Windows copy so the engine finds it the same way (sidecar/ops/_common.py):
#
#   vendor/ghostscript/bin/gs                     the program
#   vendor/ghostscript/lib/PDFA_def.ps            PDF/A template (pdf_pdfa.py)
#   vendor/ghostscript/iccprofiles/default_rgb.icc  sRGB profile for PDF/A
#
# Artifex publishes no macOS build, so this compiles the release source. The
# source tarball carries its own copies of every image and font library
# (libpng, libjpeg, zlib, freetype, lcms2, openjpeg, jbig2dec, libtiff), and
# the init files and fonts are compiled into the program (COMPILE_INITS), so
# the result needs nothing from Homebrew and nothing beside it at run time.
# The link check at the end fails the build if that ever stops being true.
#
# Builds for the machine's own architecture (Apple Silicon or Intel).
#
#   bash scripts/build-ghostscript-macos.sh
set -euo pipefail

VERSION="10.07.1"
TAG="gs10071"
# GitHub's published digest for this asset; the Windows build pins the same
# release (release-desktop.yml).
SHA256="2fc74362f9be6fae1b0a65d38fdcfd4f0b518cc3b07c5581fb661eb4d2e15251"
URL="https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/$TAG/ghostscript-$VERSION.tar.gz"

root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/vendor/ghostscript"
work="$root/build/ghostscript"

export MACOSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-11.0}"

mkdir -p "$work"
tarball="$work/ghostscript-$VERSION.tar.gz"
if [[ ! -f "$tarball" ]]; then
  echo "Downloading Ghostscript $VERSION source..."
  curl -fsSL --retry 3 -o "$tarball" "$URL"
fi
actual="$(shasum -a 256 "$tarball" | cut -d' ' -f1)"
if [[ "$actual" != "$SHA256" ]]; then
  echo "Ghostscript source hash mismatch. Expected $SHA256, got $actual" >&2
  rm -f "$tarball"
  exit 1
fi

src="$work/ghostscript-$VERSION"
rm -rf "$src"
tar -xzf "$tarball" -C "$work"

echo "Configuring..."
cd "$src"
# Everything optional that would reach outside the bundle is switched off:
# printing (CUPS), desktop integration (D-Bus, GTK, X11), system fonts
# (fontconfig), and libraries only some Macs have. Tesseract OCR inside
# Ghostscript is unused (the app drives Tesseract itself). pkg-config is
# hidden so nothing installed on the build machine gets picked up.
PKG_CONFIG=/usr/bin/false ./configure \
  --disable-cups \
  --disable-dbus \
  --disable-gtk \
  --without-x \
  --disable-fontconfig \
  --without-libidn \
  --without-libpaper \
  --without-tesseract \
  --without-pdftoraster \
  --without-ijs \
  > "$work/configure.log" 2>&1 || { tail -40 "$work/configure.log"; exit 1; }

echo "Compiling (a few minutes)..."
make -j"$(sysctl -n hw.ncpu)" gs > "$work/make.log" 2>&1 || { tail -60 "$work/make.log"; exit 1; }

rm -rf "$dest"
mkdir -p "$dest/bin" "$dest/lib" "$dest/iccprofiles"
cp bin/gs "$dest/bin/gs"
strip -x "$dest/bin/gs"
# Stripping invalidates the linker's ad-hoc signature, and Apple Silicon will
# not run an unsigned program at all.
codesign --force --sign - "$dest/bin/gs"
cp lib/PDFA_def.ps "$dest/lib/"
cp iccprofiles/default_rgb.icc "$dest/iccprofiles/"

gs="$dest/bin/gs"

echo "Checking it links only to macOS itself..."
otool -L "$gs"
foreign="$(otool -L "$gs" | tail -n +2 | awk '{print $1}' | grep -v -E '^(/usr/lib/|/System/)' || true)"
if [[ -n "$foreign" ]]; then
  echo "Ghostscript links to libraries a Mac without Homebrew does not have:" >&2
  echo "$foreign" >&2
  exit 1
fi

# Run it from outside the source tree, so a missing compiled-in resource
# (fonts, init files) shows up here rather than on a user's Mac.
echo "Smoke testing..."
smoke="$(mktemp -d)"
cat > "$smoke/in.ps" <<'EOF'
/Helvetica findfont 24 scalefont setfont
72 720 moveto (iLoathePDF) show
showpage
EOF
(cd "$smoke" && "$gs" -q -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -sOutputFile=out.pdf in.ps)
(cd "$smoke" && "$gs" -q -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -r72 -sOutputFile=out.png out.pdf)
for f in out.pdf out.png; do
  if [[ ! -s "$smoke/$f" ]]; then
    echo "Ghostscript smoke test produced no $f" >&2
    exit 1
  fi
done
rm -rf "$smoke"

"$gs" --version
echo "Ghostscript ready: $gs ($(du -sh "$dest" | cut -f1))"
