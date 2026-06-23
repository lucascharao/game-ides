#!/usr/bin/env python3
import json
import os
import getpass
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


API_URL = "https://api.elevenlabs.io/v1/sound-generation"
OUTPUT_DIR = Path("audio/sfx")

SFX = [
    {
        "name": "select",
        "text": "Clean futuristic arcade menu select blip, short soft glassy chime, no speech, no music",
        "duration_seconds": 0.7,
        "prompt_influence": 0.75,
    },
    {
        "name": "start",
        "text": "Retro fighting game round start whoosh with deep arena thump, polished arcade sound effect, no speech, no music",
        "duration_seconds": 1.3,
        "prompt_influence": 0.65,
    },
    {
        "name": "fight",
        "text": "Punchy arcade fight start impact, short cinematic bass hit with bright energy snap, no voice, no music",
        "duration_seconds": 1.0,
        "prompt_influence": 0.7,
    },
    {
        "name": "punch",
        "text": "Fast arcade punch whoosh and soft body impact, crisp but not harsh, fighting game sound effect",
        "duration_seconds": 0.65,
        "prompt_influence": 0.72,
    },
    {
        "name": "kick",
        "text": "Heavy fighting game kick swing with meaty impact, polished arcade sound effect, short and punchy",
        "duration_seconds": 0.75,
        "prompt_influence": 0.72,
    },
    {
        "name": "hit",
        "text": "Satisfying fighting game hit impact, bass body blow with small electric sparkle, no gore, no speech",
        "duration_seconds": 0.8,
        "prompt_influence": 0.7,
    },
    {
        "name": "block",
        "text": "Arcade fighting game block clang, shield impact with quick metallic spark, short clean sound effect",
        "duration_seconds": 0.65,
        "prompt_influence": 0.72,
    },
    {
        "name": "jump",
        "text": "Short arcade jump swoosh, light upward movement sound, polished retro fighter effect, no voice",
        "duration_seconds": 0.55,
        "prompt_influence": 0.72,
    },
    {
        "name": "special",
        "text": "Cyber fighting game special attack charge and release, electric energy surge with deep impact, no speech",
        "duration_seconds": 1.6,
        "prompt_influence": 0.62,
    },
    {
        "name": "ko",
        "text": "Dramatic arcade knockout impact, deep bass slam with fading energy tail, no announcer voice, no music",
        "duration_seconds": 1.8,
        "prompt_influence": 0.65,
    },
]


def read_api_key() -> str:
    env_key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if env_key:
        return env_key
    if not sys.stdin.isatty():
        return sys.stdin.readline().strip()
    return getpass.getpass("ELEVENLABS_API_KEY: ").strip()


def generate_effect(api_key: str, item: dict) -> bytes:
    payload = {
        "text": item["text"],
        "model_id": "eleven_text_to_sound_v2",
        "duration_seconds": item["duration_seconds"],
        "prompt_influence": item["prompt_influence"],
    }
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        API_URL,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "xi-api-key": api_key,
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def main() -> int:
    api_key = read_api_key()
    if not api_key:
        print("Missing ELEVENLABS_API_KEY", file=sys.stderr)
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for index, item in enumerate(SFX, start=1):
        target = OUTPUT_DIR / f"{item['name']}.mp3"
        print(f"[{index}/{len(SFX)}] generating {target}")
        try:
            target.write_bytes(generate_effect(api_key, item))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            print(f"Failed {item['name']}: HTTP {error.code} {detail}", file=sys.stderr)
            return 1
        except Exception as error:
            print(f"Failed {item['name']}: {error}", file=sys.stderr)
            return 1
        time.sleep(0.25)

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
