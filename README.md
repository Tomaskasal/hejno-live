# HEJNO — nasazení

Live hra pro firemní event: hejno ptáků na projekci, každý účastník vede
pětici ptáků telefonem. Projekce běží simulaci, telefony posílají jen směr.

## Struktura

```
server.js          – Node.js relay server (Express + ws)
public/index.html  – projekce i telefon (jeden soubor)
public/hejno.js    – klientská logika
```

## Spuštění

Vyžaduje Node.js 18+.

```bash
npm install
npm start            # výchozí port 3000
PORT=8080 npm start  # jiný port
```

- **Projekce** (velké plátno): `http://server:3000/` — otevřít v prohlížeči, F11 fullscreen.
- **Telefony**: `http://server:3000/?mode=telefon` — QR kód na projekci na tuto adresu míří automaticky.

## HTTPS (nutné pro provoz přes internet)

Telefony mimo lokální síť potřebují HTTPS (a tedy `wss://` — klient si schéma
odvodí sám). Nejjednodušší je reverse proxy:

**Caddy** (automatický certifikát):
```
hejno.vase-domena.cz {
    reverse_proxy localhost:3000
}
```

**nginx**: klasická proxy_pass konfigurace + certbot; nezapomeňte na WebSocket hlavičky:
```
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

## Jak to funguje

- Telefon → server: `join` (jméno, druh), `dir` (směr, max 10×/s), `ping` (3 s), `leave`.
- Server přeposílá zprávy telefonů jen projekci a zprávy projekce (`state`) jen telefonům.
- Projekce je autoritativní: běží na ní simulace, neaktivní hráče (20 s) odebere;
  telefon pak nabídne „Znovu připojit".
- Při výpadku spojení se klient sám reconnectuje (2 s) a hráč se znovu přihlásí.

## Kapacita

500 hráčů ≈ 500 WS spojení a ~2 500 malých zpráv/s směrem k projekci —
v pohodě na jednom malém VPS. Simulace (hejno) běží pouze v prohlížeči
u projekce; výkon serveru je zanedbatelný.

## Ladění

- Počet ambientních ptáků a timeout: konstanty `AMBIENT` a `IDLE_MS` na začátku `public/hejno.js`.
- QR kód se generuje přes api.qrserver.com — pokud má server běžet zcela offline,
  nahraďte lokální knihovnou (např. `qrcode` na npm) a vygenerujte PNG při startu.
