"""
Photo Studio — Local AI image generation and editing
Uses FLUX.2 Klein 4B and Z-Image Turbo via diffusers.

Models resolve in this order:
  1. Env override (PHOTO_STUDIO_FLUX_MODEL / PHOTO_STUDIO_ZIMAGE_MODEL) —
     a local folder or a HuggingFace repo id
  2. HuggingFace default (auto-downloads to the HF cache on first run)

Optional:
  PHOTO_STUDIO_ZIMAGE_ADAPTER — path to a Z-Image LoRA adapter .safetensors
  --analyze / --enhance need a local Ollama with a vision model (default gemma3:4b,
  override with PHOTO_STUDIO_OLLAMA_MODEL); they fail with a clear message otherwise.

Usage:
  python photo-studio.py --prompt "full-body portrait, cinematic"
  python photo-studio.py --prompt "wide body view" --image char.jpg --model flux
  python photo-studio.py --prompt "editorial photo" --model zimage --width 1152 --height 2048
"""

import argparse
import os
import sys
import time
from pathlib import Path

FLUX_MODEL = os.environ.get("PHOTO_STUDIO_FLUX_MODEL", "black-forest-labs/FLUX.2-klein-4B")
ZIMAGE_MODEL = os.environ.get("PHOTO_STUDIO_ZIMAGE_MODEL", "Tongyi-MAI/Z-Image-Turbo")
ZIMAGE_ADAPTER = os.environ.get("PHOTO_STUDIO_ZIMAGE_ADAPTER", "")
OLLAMA_MODEL = os.environ.get("PHOTO_STUDIO_OLLAMA_MODEL", "gemma3:4b")


def require_cuda():
    import torch
    if not torch.cuda.is_available():
        sys.exit(
            "❌ No CUDA GPU available. Local generation needs an NVIDIA GPU "
            "(~16GB VRAM recommended). Use the Kolbo MCP generate_image tool instead."
        )


# ─── Ollama helpers (optional) ────────────────────────────────────────────────

def _ollama():
    try:
        import ollama
        return ollama
    except ImportError:
        sys.exit("❌ --analyze/--enhance need Ollama (`pip install ollama` + a running Ollama server). Re-run without these flags.")


def analyze_image(image_path: str) -> str:
    ollama = _ollama()
    print(f"   🔍 Analyzing image with {OLLAMA_MODEL}: {image_path}")
    response = ollama.chat(model=OLLAMA_MODEL, messages=[{
        'role': 'user',
        'content': (
            'Describe this image in detail: subject, pose, clothing, lighting, setting, mood. '
            'Be concise but complete — this will be used as a base for a generation prompt.'
        ),
        'images': [image_path]
    }], keep_alive=0)
    desc = response['message']['content'].strip()
    print(f"   📝 Analysis: {desc[:120]}...")
    return desc


def enhance_prompt(prompt: str) -> str:
    ollama = _ollama()
    print(f"   ✨ Enhancing prompt with {OLLAMA_MODEL}...")
    response = ollama.chat(model=OLLAMA_MODEL, messages=[{
        'role': 'user',
        'content': (
            f'Rewrite this image generation prompt to be more detailed and vivid. '
            f'Keep the core subject and intent. Add lighting, mood, style, camera details. '
            f'Max 2 sentences. Output ONLY the improved prompt, no explanations.\n\n'
            f'Prompt: {prompt}'
        )
    }], keep_alive=0)
    enhanced = response['message']['content'].strip()
    print(f"   📝 Enhanced: {enhanced[:120]}...")
    return enhanced


# ─── FLUX.2 Klein 4B ──────────────────────────────────────────────────────────

def run_flux(prompt: str, image_path: str | None, width: int, height: int,
             steps: int, cfg: float, seed: int | None, output_path: str):
    import torch
    from diffusers import Flux2KleinPipeline
    from PIL import Image

    require_cuda()
    print(f"   🚀 Loading FLUX.2 Klein 4B ({FLUX_MODEL})...")
    torch.cuda.set_per_process_memory_fraction(0.75)
    pipe = Flux2KleinPipeline.from_pretrained(FLUX_MODEL, torch_dtype=torch.bfloat16).to("cuda")

    kwargs = dict(
        prompt=prompt,
        width=width,
        height=height,
        num_inference_steps=steps,
        guidance_scale=cfg,
    )

    if image_path:
        input_img = Image.open(image_path).convert("RGB").resize((width, height))
        kwargs['image'] = input_img
        print(f"   🖼️  Image editing mode: {image_path}")
    else:
        print(f"   🎨 Text-to-image mode")

    if seed is not None:
        kwargs['generator'] = torch.Generator("cuda").manual_seed(seed)

    print(f"   ▶  Generating {width}×{height} | steps={steps} | cfg={cfg}")
    t0 = time.time()
    result = pipe(**kwargs)
    elapsed = time.time() - t0

    result.images[0].save(output_path)
    print(f"   ✅ Saved to {output_path} ({elapsed:.1f}s)")
    pipe.to("cpu")
    del pipe
    import gc; gc.collect()
    torch.cuda.empty_cache()


# ─── Z-Image Turbo ────────────────────────────────────────────────────────────

def run_zimage(prompt: str, width: int, height: int,
               steps: int, cfg: float, seed: int | None,
               use_adapter: bool, output_path: str):
    import torch
    from diffusers import ZImagePipeline

    require_cuda()
    print(f"   🚀 Loading Z-Image Turbo ({ZIMAGE_MODEL})...")
    # Z-Image total ~15.5GB bfloat16 — CPU offload keeps peak VRAM ~11.5GB
    torch.cuda.set_per_process_memory_fraction(0.75)
    pipe = ZImagePipeline.from_pretrained(ZIMAGE_MODEL, torch_dtype=torch.bfloat16)
    pipe.enable_model_cpu_offload()

    if use_adapter:
        if ZIMAGE_ADAPTER and Path(ZIMAGE_ADAPTER).exists():
            print(f"   🔗 Loading adapter: {Path(ZIMAGE_ADAPTER).name}")
            pipe.load_lora_weights(ZIMAGE_ADAPTER)
        else:
            print("   ⚠️  --adapter requested but PHOTO_STUDIO_ZIMAGE_ADAPTER is unset or missing — continuing without it")

    kwargs = dict(
        prompt=prompt,
        width=width,
        height=height,
        num_inference_steps=steps,
        guidance_scale=cfg,
    )

    if seed is not None:
        kwargs['generator'] = torch.Generator("cpu").manual_seed(seed)

    print(f"   ▶  Generating {width}×{height} | steps={steps} | cfg={cfg}")
    t0 = time.time()
    result = pipe(**kwargs)
    elapsed = time.time() - t0

    result.images[0].save(output_path)
    print(f"   ✅ Saved to {output_path} ({elapsed:.1f}s)")
    pipe.to("cpu")
    del pipe
    import gc; gc.collect()
    torch.cuda.empty_cache()


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Photo Studio — local FLUX.2 Klein 4B / Z-Image Turbo generation"
    )
    parser.add_argument('--prompt',   type=str,  default='',         help='Text prompt')
    parser.add_argument('--image',    type=str,  default=None,       help='Input image path (for editing with flux)')
    parser.add_argument('--model',    type=str,  default='flux',     choices=['flux', 'zimage'], help='Model to use')
    parser.add_argument('--output',   type=str,  default=None,       help='Output file path (default: output_<timestamp>.jpg)')
    parser.add_argument('--width',    type=int,  default=1152,       help='Output width (default: 1152)')
    parser.add_argument('--height',   type=int,  default=2048,       help='Output height (default: 2048)')
    parser.add_argument('--steps',    type=int,  default=None,       help='Inference steps (flux default: 20, zimage default: 8)')
    parser.add_argument('--cfg',      type=float,default=None,       help='Guidance scale (flux default: 3.5, zimage default: 0.0)')
    parser.add_argument('--seed',     type=int,  default=None,       help='Random seed')
    parser.add_argument('--analyze',  action='store_true',           help='Analyze --image with a local Ollama vision model and use as base description')
    parser.add_argument('--enhance',  action='store_true',           help='Enhance --prompt with a local Ollama model before generating')
    parser.add_argument('--adapter',  action='store_true',           help='Load Z-Image adapter from PHOTO_STUDIO_ZIMAGE_ADAPTER (zimage only)')

    args = parser.parse_args()

    if not args.prompt and not args.image:
        parser.error("Provide at least --prompt or --image")
    if args.model == 'zimage' and args.image:
        print("   ⚠️  Z-Image Turbo is text-to-image only — ignoring --image for generation")

    print(f"\n📸 Photo Studio — {args.model.upper()}")

    prompt = args.prompt

    if args.analyze and args.image:
        description = analyze_image(args.image)
        prompt = f"{description}. {prompt}" if prompt else description

    if args.enhance and prompt:
        prompt = enhance_prompt(prompt)

    if not prompt:
        prompt = "full-body portrait, cinematic lighting, photorealistic"
        print(f"   ℹ️  No prompt — using default: {prompt}")

    print(f"   💬 Final prompt: {prompt[:100]}...")

    output_path = args.output
    if not output_path:
        ts = int(time.time())
        output_path = f"output_{args.model}_{ts}.jpg"

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    if args.model == 'flux':
        run_flux(
            prompt=prompt,
            image_path=args.image,
            width=args.width,
            height=args.height,
            steps=args.steps or 20,
            cfg=args.cfg if args.cfg is not None else 3.5,
            seed=args.seed,
            output_path=output_path,
        )
    else:
        # Z-Image Turbo: 8 NFEs, no CFG (distilled model — per official README)
        run_zimage(
            prompt=prompt,
            width=args.width,
            height=args.height,
            steps=args.steps or 8,
            cfg=args.cfg if args.cfg is not None else 0.0,
            seed=args.seed,
            use_adapter=args.adapter,
            output_path=output_path,
        )


if __name__ == '__main__':
    main()
