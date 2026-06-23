# IDE Kombat

Fighting game estatico em HTML, CSS e JavaScript.

## Rodar localmente

```bash
python3 -m http.server 5180
```

Abra `http://localhost:5180/`.

## Efeitos sonoros

Os efeitos finais ficam em `audio/sfx/*.mp3`.

Para regenerar os sons com ElevenLabs:

```bash
python3 scripts/generate_sfx.py
```

O script le `ELEVENLABS_API_KEY` do ambiente ou pede a chave no terminal sem grava-la no repositorio.
