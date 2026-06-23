# IDE Kombat

Fighting game estatico em HTML, CSS e JavaScript.

## Rodar localmente

```bash
python3 -m http.server 5180
```

Abra `http://localhost:5180/`.

## Multiplayer por convite

Sem login. O servidor mantém salas em memoria e aceita dois jogadores por codigo.

Rodar o servidor multiplayer:

```bash
PORT=3000 node server.js
```

Gerar convite pela CLI:

```bash
node server.js invite --host http://localhost:3000
```

Na VPS, use o dominio publico:

```bash
node server.js invite --host https://seu-dominio.com
```

Compartilhe a URL gerada ou apenas o codigo. Quem inserir o mesmo codigo entra na mesma sala.

## Efeitos sonoros

Os efeitos finais ficam em `audio/sfx/*.mp3`.

Para regenerar os sons com ElevenLabs:

```bash
python3 scripts/generate_sfx.py
```

O script le `ELEVENLABS_API_KEY` do ambiente ou pede a chave no terminal sem grava-la no repositorio.
