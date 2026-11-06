#!/bin/bash
set -e

APP_DIR='/opt/${sanitizedProductName}'
APP_EXECUTABLE='${executable}'

if type update-alternatives >/dev/null 2>&1; then
  update-alternatives --remove "$APP_EXECUTABLE" "/opt/Descargar UCLV/$APP_EXECUTABLE" 2>/dev/null || true
  if [ -L "/usr/bin/$APP_EXECUTABLE" ] && [ -e "/usr/bin/$APP_EXECUTABLE" ] \
    && [ "$(readlink "/usr/bin/$APP_EXECUTABLE")" != "/etc/alternatives/$APP_EXECUTABLE" ]; then
    rm -f "/usr/bin/$APP_EXECUTABLE"
  fi
  update-alternatives --install "/usr/bin/$APP_EXECUTABLE" "$APP_EXECUTABLE" "$APP_DIR/$APP_EXECUTABLE" 100 \
    || ln -sf "$APP_DIR/$APP_EXECUTABLE" "/usr/bin/$APP_EXECUTABLE"
else
  ln -sf "$APP_DIR/$APP_EXECUTABLE" "/usr/bin/$APP_EXECUTABLE"
fi

# Ubuntu's AppArmor policy can block Chromium user namespaces even when
# `unshare --user` succeeds. Keep Electron's renderer sandbox available via
# Chromium's standard root-owned helper for this Debian package.
chown root:root "$APP_DIR/chrome-sandbox"
chmod 4755 "$APP_DIR/chrome-sandbox"

if hash update-mime-database 2>/dev/null; then
  update-mime-database /usr/share/mime || true
fi
if hash update-desktop-database 2>/dev/null; then
  update-desktop-database /usr/share/applications || true
fi
