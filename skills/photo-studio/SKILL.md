---
name: photo-studio
description: >
  Local AI photo generation and editing using FLUX.2 Klein 4B and Z-Image Turbo
  (no API cost, no rate limits). Requires an NVIDIA GPU (~16GB VRAM) and Python;
  models auto-download from HuggingFace on first run. If the machine has no
  suitable GPU or setup fails, fall back to the Kolbo MCP `generate_image` tool.
  Keywords: generate image, edit image, flux klein, z-image turbo, local diffusion, photo studio
---

# Photo Studio — Local AI Image Generation & Editing

## Requirements (check BEFORE anything else)

1. **NVIDIA GPU** with ~16GB VRAM (Z-Image needs ~11.5GB with CPU offload, FLUX ~13GB).
   Verify: `nvidia-smi` succeeds and shows enough memory.
2. **Python 3.10+** available on PATH.
3. **~35GB free disk** for model downloads (first run only; cached afterwards in the HF cache).

**If any requirement fails, do NOT run this skill.** Tell the user local generation isn't
available on this machine and use the Kolbo MCP `mcp__kolbo__generate_image` tool instead
(if the `mcp__kolbo__*` tools are also missing, say the Kolbo MCP isn't connected and ask
them to sign in / reconnect in the app — never invent local paths).

## Setup (first use — idempotent)

The script ships with this skill at `scripts/photo-studio.py` (relative to this SKILL.md).

Create a venv next to it once and install deps (`Flux2KleinPipeline` / `ZImagePipeline`
currently require diffusers from git):

```bash
python -m venv <skill-dir>/scripts/venv
<venv>/pip install torch --index-url https://download.pytorch.org/whl/cu124
<venv>/pip install "git+https://github.com/huggingface/diffusers.git" transformers accelerate pillow safetensors sentencepiece
```

Models auto-download from HuggingFace on first generation:
- FLUX.2 Klein 4B → `black-forest-labs/FLUX.2-klein-4B`
- Z-Image Turbo → `Tongyi-MAI/Z-Image-Turbo`

Optional env overrides (for machines with local model copies):

| Env var | Meaning |
|---------|---------|
| `PHOTO_STUDIO_FLUX_MODEL` | Local folder or HF repo id for FLUX |
| `PHOTO_STUDIO_ZIMAGE_MODEL` | Local folder or HF repo id for Z-Image |
| `PHOTO_STUDIO_ZIMAGE_ADAPTER` | Path to a Z-Image LoRA `.safetensors` (needed for `--adapter`) |

## How to Run

```bash
<venv>/python <skill-dir>/scripts/photo-studio.py [args...]
```

## CLI Reference

| Flag | Default | Description |
|------|---------|-------------|
| `--prompt "..."` | — | Text prompt |
| `--image path.jpg` | — | Input image (FLUX editing only) |
| `--model flux\|zimage` | `flux` | Model to use |
| `--output result.jpg` | `output_<ts>.jpg` | Output path |
| `--width N` | 1152 | Width in pixels |
| `--height N` | 2048 | Height in pixels |
| `--steps N` | 20 | Inference steps |
| `--cfg N` | 3.5 | Guidance scale |
| `--seed N` | random | Deterministic seed |
| `--adapter` | off | Load Z-Image adapter from `PHOTO_STUDIO_ZIMAGE_ADAPTER` (zimage only) |

## Common Recipes

### Text-to-image (portrait)
```bash
python photo-studio.py \
  --prompt "full-body front view, woman in designer dress, cinematic lighting" \
  --model flux --width 1152 --height 2048
```

### Edit existing image
```bash
python photo-studio.py \
  --image input.jpg \
  --prompt "wide full-body view of the subject, cinematic" \
  --model flux --width 1152 --height 2048
```

### Analyze image then generate variation
```
# Step 1: Read the image — the agent sees it natively (built-in vision)
Read("/abs/path/to/char.jpg")
→ Agent describes the person: clothing, pose, features, style

# Step 2: Use the description as the prompt
python photo-studio.py \
  --prompt "<description from agent vision> standing upright, full body" \
  --model flux
```

### Enhance a short prompt then generate
```
# Step 1: Enhance the prompt with Kolbo MCP
chat_send_message({
  message: "Expand this into a detailed image generation prompt for a photorealistic portrait: 'street fashion guy'",
})
→ { content: "A young man in his mid-20s wearing..." }

# Step 2: Generate with the enhanced prompt
python photo-studio.py \
  --prompt "<enhanced prompt from Kolbo>" \
  --model zimage --width 1152 --height 2048
```

### Z-Image with adapter (MIRAGE-style)
```bash
python photo-studio.py \
  --prompt "cinematic full-body portrait, editorial" \
  --model zimage --adapter --width 1152 --height 1536 --cfg 4.0
```

## Model Notes

### FLUX.2 Klein 4B (`--model flux`)
- Class: `Flux2KleinPipeline` (diffusers)
- Supports both text-to-image AND image editing via `image` param
- Good default: `--steps 20 --cfg 3.5`
- ~13GB VRAM needed

### Z-Image Turbo (`--model zimage`)
- Class: `ZImagePipeline` (diffusers), uses Qwen3 text encoder
- Text-to-image ONLY (no image editing)
- **8 NFEs, no CFG** — distilled model, per official README. More steps = waste, CFG > 0 = wrong
- Default: `--steps 8 --cfg 0.0 --width 1152 --height 2048` (~30s per image on a strong GPU)
- `--adapter` only works when `PHOTO_STUDIO_ZIMAGE_ADAPTER` points at an adapter file

### Vision & Prompt Enhancement
- For image analysis: use the agent's built-in vision — `Read` the image file directly, no MCP needed
- For prompt enhancement: `chat_send_message` asking Kolbo to expand a short prompt (text-only, no vision)
- Do NOT use `--analyze` or `--enhance` flags (they need a local Ollama server — agent vision covers it)

## When to use which model

| Task | Model |
|------|-------|
| Edit an existing image | `flux` |
| Character body panel generation | `flux` |
| MIRAGE-style portraits | `zimage --adapter` |
| Quick text-to-image | `flux` or `zimage` |
| Portrait + face reference | `flux --image face.jpg` |

## Prompt Tips

When the user gives a short/vague prompt, use `chat_send_message` to let Kolbo AI expand it before passing to the script. For image editing, first analyze the source image with the agent's built-in vision (`Read` the image), then use the description as the base prompt.
