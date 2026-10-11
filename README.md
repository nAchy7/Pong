# Pong

Pong pro prohlížeč s českým rozhraním. Hraj proti počítači ve třech obtížnostech nebo s druhým hráčem na jedné klávesnici. První hráč se 7 body vyhrává.

## Spuštění

Je potřeba Node.js 20 nebo novější. Projekt nepoužívá externí balíčky, takže není potřeba nic instalovat.

```sh
cd /workspace/Pong
npm start
```

Server standardně poslouchá na portu `3000`. Port a rozhraní lze změnit proměnnými `PORT` a `HOST`.

## Ovládání

| Akce | Klávesy |
| --- | --- |
| Levá pálka | W / S |
| Pravá pálka v režimu dvou hráčů | ↑ / ↓ |
| Levá pálka proti počítači | také ↑ / ↓ |
| Spuštění, pauza a pokračování | mezerník |
| Pauza | Escape |

Na dotykové obrazovce táhni prstem po hrací ploše. V režimu dvou hráčů levá polovina ovládá levou pálku a pravá polovina pravou pálku, i současně. Přepnutí režimu nebo obtížnosti připraví nový zápas. Zvuk je zpočátku vypnutý a lze jej zapnout ikonou reproduktoru. Při opuštění okna se hra automaticky pozastaví.

## Ověření

```sh
npm test
```

Testy ověřují herní logiku pomocí vestavěného `node:test`. Prohlížeč musí podporovat Canvas 2D a moduly JavaScriptu. Nejsou potřeba žádné služby, klíče, sestavení ani připojení k internetu při hraní.
