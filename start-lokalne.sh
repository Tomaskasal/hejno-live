#!/usr/bin/env bash
# Záložní režim: server běží na tomhle notebooku, telefony se připojí přes WiFi.
# Pozor: nefunguje na sítích s izolací klientů (typicky hotelová/veřejná WiFi).
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost)
echo ""
echo "  Projekce:  http://$IP:3000/"
echo "  Telefony:  http://$IP:3000/?mode=telefon"
echo ""
node server.js
