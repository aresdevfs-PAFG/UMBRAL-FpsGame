"""Package imagegen-authored frames; no procedural character drawing."""
from pathlib import Path
import json
from PIL import Image

HERE = Path(__file__).resolve().parent
CELL = (192, 256)
DURATIONS = [100, 80, 100, 80, 100, 80, 100, 80]


def build():
    source = Image.open(HERE / "sources/run-source.png").convert("RGBA")
    assert source.size == (1536, 1024), "Expected the authored 4 by 2 sheet"
    frames = []
    for row in range(2):
        for col in range(4):
            frame = source.crop((col * 384, row * 512, (col + 1) * 384, (row + 1) * 512))
            frames.append(frame.resize(CELL, Image.Resampling.NEAREST))

    atlas = Image.new("RGBA", (CELL[0] * 4, CELL[1] * 2))
    for index, frame in enumerate(frames):
        atlas.alpha_composite(frame, ((index % 4) * CELL[0], (index // 4) * CELL[1]))
    atlas.save(HERE / "protagonista-movimiento.png", optimize=True)
    frames[0].save(HERE / "protagonista.png", optimize=True)

    # Use one palette for the entire loop to avoid color flickering.
    rgb_sheet = Image.new("RGB", atlas.size, (18, 16, 20))
    rgb_sheet.paste(atlas.convert("RGB"), mask=atlas.getchannel("A").point(lambda a: 255 if a >= 128 else 0))
    palette = rgb_sheet.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    previews = []
    for frame in frames:
        indexed = frame.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE)
        indexed.putpalette(palette.getpalette()[:765] + [0, 0, 0])
        indexed.paste(255, mask=frame.getchannel("A").point(lambda a: 255 if a < 128 else 0))
        previews.append(indexed.resize((384, 512), Image.Resampling.NEAREST))
    gif = HERE / "protagonista-movimiento.gif"
    previews[0].save(
        gif, save_all=True, append_images=previews[1:], duration=DURATIONS,
        transparency=255, disposal=2, loop=0, optimize=False,
    )

    # Verify the exported animation, including its final frame and loop metadata.
    with Image.open(gif) as exported:
        assert exported.n_frames == 8
        assert exported.info["loop"] == 0
        for i, duration in enumerate(DURATIONS):
            exported.seek(i)
            assert exported.info["duration"] == duration
            assert exported.convert("RGBA").getpixel((0, 0))[3] == 0

    manifest = {
        "id": "player",
        "displayName": "current-player-name",
        "status": "art-preview",
        "artSource": "Built-in imagegen; original character and costume from the approved concept",
        "animations": {
            "move": {
                "atlas": "protagonista-movimiento.png",
                "gif": "protagonista-movimiento.gif",
                "frames": 8, "columns": 4, "rows": 2, "frameSize": list(CELL),
                "previewFrameSize": [384, 512], "durations": DURATIONS, "loop": True,
                "facing": "front-three-quarter",
                "anchorPx": [96, 244], "filter": "nearest",
            }
        },
        "medicalClues": ["left hospital wristband", "small left forearm dressing", "nearly hidden ECG electrode"],
    }
    (HERE / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Verified: {gif}; 8 frames, {sum(DURATIONS)} ms loop, {gif.stat().st_size:,} bytes.")


if __name__ == "__main__":
    build()
