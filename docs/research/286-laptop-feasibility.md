# Can this laptop train a tiny model and fine-tune a small open one? (#286)

Part of the map [#285 Ворожка: our own fortune model?](https://github.com/git-sparrow/kavtsya/issues/285). Machine: Apple M4 Pro, 24 GB unified memory, 16-core GPU (checked 2026-10-03). Researched 2026-10-03.

## Answer

1. **c (from scratch): yes, easily.** A nanoGPT-sized model (~10M parameters) on a few thousand fortunes (well under 1 MB of text) should train in minutes to tens of minutes with PyTorch `mps` or MLX. The timing is an estimate.
2. **a (LoRA): yes, up to about 12B parameters with QLoRA (4-bit) in `mlx-lm`.** A 4B-class model is the comfortable choice: fast, with plenty of memory headroom. 27B and larger won't fit. Rent a cloud GPU only for those.
3. **Ukrainian:** the best small open models are Ukrainian-tuned Gemma 3 derivatives: **MamayLM 4B/12B** and **Lapa 12B**, under the Gemma Terms of Use (commercial use allowed, with a prohibited-use policy that passes down). The cleaner licence is **Gemma 4** and **Qwen 3.5** at **Apache 2.0**. Their Ukrainian quality is unverified.

## Decision for Olek

Nothing to do now. Pick the base model for experiment a when designing it (see "Not yet specified" in #285). The trade-off is laid out under question 3.

---

## 1. Experiment c: a tiny model from scratch

**Tools.** All are free and run locally:

| Tool | What it is | Status (checked 2026-10-03) |
| --- | --- | --- |
| [nanoGPT](https://github.com/karpathy/nanoGPT) (PyTorch) | ~300 lines of readable GPT training code. The `shakespeare_char` recipe is exactly our shape: character-level, a small corpus | Repo active (last push 2025-11-12, not archived). PyTorch on PyPI: 2.14.1 |
| PyTorch `mps` device | Runs PyTorch on the Apple GPU | The nanoGPT README says `--device=mps` gives a "2-3X" speed-up over CPU |
| [MLX](https://github.com/ml-explore/mlx) + [`mlx-examples/transformer_lm`](https://github.com/ml-explore/mlx-examples/tree/main/transformer_lm) | Apple's own array framework, with a small transformer LM example | `mlx` on PyPI: 0.32.3 |

**Recommendation for learning:** use nanoGPT with `--device=mps`. It has the most tutorials, Karpathy's "Let's build GPT" video walks through the same code, and the recipe maps 1:1 onto our data.

**Size of the job.**
- nanoGPT's baby config is 6 layers, 6 heads, 384-dim embeddings, 256-character context, 5000 iterations (from [`config/train_shakespeare_char.py`](https://github.com/karpathy/nanoGPT/blob/master/config/train_shakespeare_char.py)). That is roughly 10M parameters (my arithmetic).
- Its dataset is "a single (1MB) file". A few thousand fortunes at ~120 characters each is only about 0.3–0.6 MB, *smaller* than Shakespeare.
- The README reports about 3 minutes on one A100 for the full config. A reduced config on a laptop CPU also finishes in "about ~3 minutes" (loss 1.88 vs 1.47).

**Realistic time on the M4 Pro: about 10–30 minutes for the full baby config. This is unverified**, extrapolated from the README figures above. Nobody has published a benchmark for this exact chip and model. Measure it in the first run.

**What to expect.** With so little text, the model will learn Ukrainian spelling and the fortune "shape". It will produce plenty of non-words and will start memorising seed fortunes if trained too long. That is fine for the learning goal, but it is very unlikely to beat Claude in Mari's blind review. The two things to learn are watching the validation loss and stopping early. Character-level is the simplest way to handle Ukrainian. A tokenizer is an optional second step.

## 2. Experiment a: LoRA fine-tune of a small open model

**Tool:** [`mlx-lm`](https://github.com/ml-explore/mlx-lm). Its [LORA.md](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md) (read 2026-10-03) says:
- It supports `lora` (the default), `dora` and `full` fine-tuning. Pointing it at a 4-bit quantized model gives **QLoRA** automatically.
- Data is JSONL in `chat`, `completions` or `text` format. Our fortunes fit `completions` or `text` directly.
- The commands are `mlx_lm.lora --train`, `mlx_lm.generate --adapter-path`, and `mlx_lm.fuse`.
- Memory levers: QLoRA, a smaller batch (default 4), fewer tuned layers (default 16), shorter sequences, and gradient checkpointing.
- Its own benchmark: about 250 tokens/s on an M1 Max with 32 GB (batch 1, 4 layers).
- It has model files for `gemma3`, `gemma4`, `qwen3` and `qwen3_5` (checked via GitHub API, 2026-10-03), so every candidate below is supported.
- Versions: PyPI `mlx-lm` 0.32.0, while the latest GitHub release is v0.31.3 (2026-04-22). Both were checked 2026-10-03.
- The [README](https://github.com/ml-explore/mlx-lm) needs macOS 15+ for large models. It also suggests `sudo sysctl iogpu.wired_limit_mb=N` to raise the GPU memory cap.

**What fits in 24 GB.** These figures are my arithmetic, not a measured benchmark:

| Model size | Weights at 4-bit (QLoRA) | Weights at 16-bit (plain LoRA) | Verdict on 24 GB |
| --- | --- | --- | --- |
| ~4B (Gemma 4 E4B, MamayLM 4B, Qwen3.5-4B) | ~2.5–3 GB | ~8 GB | **Comfortable.** The recommended start |
| ~9–12B (MamayLM 12B, Lapa 12B, Gemma 4 12B, Qwen3.5-9B) | ~6–7 GB | ~18–24 GB | QLoRA should fit. Plain 16-bit LoRA won't |
| 26–31B (Gemma 4 26B/31B, Qwen3.5-27B) | ~15–17 GB | — | Doesn't fit in practice: too close to the GPU memory cap |

Short fortunes (under 64 tokens) keep activation memory tiny, which helps a lot. **Unverified:** the default GPU memory cap macOS sets on a 24 GB Mac. Commonly cited values are around two-thirds to three-quarters of RAM. It can be raised with the sysctl above.

**Max size: about 12B with QLoRA.** Start at 4B. It trains in minutes rather than hours, and Mari's review will show whether the bigger model is worth it.

## 3. Small open models with decent Ukrainian

| Model | Sizes | Ukrainian evidence | Licence | Commercial use |
| --- | --- | --- | --- | --- |
| **MamayLM v1.0** (INSAIT) — [12B](https://huggingface.co/INSAIT-Institute/MamayLM-Gemma-3-12B-IT-v1.0), [4B](https://huggingface.co/INSAIT-Institute/MamayLM-Gemma-3-4B-IT-v1.0) | 4B, 12B (Gemma 3 base) | Built for Ukrainian. Its model card claims the 12B beats Qwen 2.5 72B and Llama 3.1 70B on Ukrainian benchmarks (self-reported) | Gemma Terms of Use | Yes, with conditions (see below) |
| **Lapa LLM** — [v0.1.3-instruct](https://huggingface.co/lapa-llm/lapa-v0.1.3-instruct) | 12B (Gemma 3 base) | Built for Ukrainian, with a Ukrainian tokenizer: about 1.5× fewer tokens for Ukrainian ([DOU](https://dou.ua/lenta/news/lapa-llm-release/)) | Gemma Terms of Use (HF tag) | Yes, with conditions |
| **Gemma 4** (Google) — [E4B-it](https://huggingface.co/google/gemma-4-E4B-it) | E2B, E4B, 12B, 26B-A4B (MoE), 31B | "Out-of-the-box support for 35+ languages, pre-trained on 140+". No Ukrainian-specific numbers. **Ukrainian quality unverified** | **Apache 2.0** | Yes, no extra conditions |
| **Qwen 3.5** (Alibaba) — [9B](https://huggingface.co/Qwen/Qwen3.5-9B) | 0.8B, 2B, 4B, 9B, … | "201 languages and dialects". Ukrainian isn't named. **Ukrainian quality unverified** | **Apache 2.0** | Yes, no extra conditions |

- Licences were read from the Hugging Face API licence tags on 2026-10-03. MamayLM v2.0 (12B/27B) was announced by INSAIT, but **no v2 weights appear on Hugging Face** as of 2026-10-03. It seems to be chat/API-on-request only, so it is excluded.
- A [Ukrainian LLM leaderboard](https://benchmarklist.com/benchmarks/ukrainian_llm_leaderboard/) built by the Lapa and MamayLM teams puts Lapa, MamayLM and Gemma in the top three. This comes via the [dev.ua report](https://dev.ua/news/liderbord-llm-iaki-shariat-ukrainsku-1766502718), a secondary source. **Unverified:** whether it already includes Gemma 4 or Qwen 3.5.
- **Gemma Terms of Use** ([terms](https://ai.google.dev/gemma/terms), last modified 2026-04-01, read 2026-10-03): you may use, modify and distribute commercially. You must follow the Gemma Prohibited Use Policy, and pass those restrictions on in any agreement if you distribute the model or a derivative. Fine-tunes count as "Model Derivatives". Gemma 4 is explicitly *not* under these terms; it is Apache 2.0.
- **For us:** serving fortunes from our own backend (no weight distribution) is allowed under both licences. Apache 2.0 is simpler. The trade-off for experiment a is a Ukrainian-tuned base with a slightly stickier licence (MamayLM 4B) versus a general base with a clean licence (Gemma 4 E4B). That choice belongs to experiment a's design. A cheap way to settle it: generate 20 fortunes from each *before* fine-tuning and let Mari judge.

## Sources (all checked 2026-10-03)

| Claim | Source |
| --- | --- |
| nanoGPT recipe, timings, `mps` speed-up | https://github.com/karpathy/nanoGPT (README, `config/train_shakespeare_char.py`) |
| PyPI versions: `mlx` 0.32.3, `mlx-lm` 0.32.0, `torch` 2.14.1 | `pip index versions` |
| MLX transformer LM example | https://github.com/ml-explore/mlx-examples/tree/main/transformer_lm |
| mlx-lm LoRA/QLoRA, data formats, memory tips, M1 Max figure | https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md |
| mlx-lm supported architectures, latest release v0.31.3 | GitHub API `repos/ml-explore/mlx-lm` |
| macOS 15, `iogpu.wired_limit_mb` | https://github.com/ml-explore/mlx-lm (README) |
| MamayLM v1.0 model card and benchmark claim | https://huggingface.co/INSAIT-Institute/MamayLM-Gemma-3-12B-IT-v1.0 |
| Licence tags (MamayLM, Lapa, Gemma 4, Qwen 3.5) | Hugging Face API `api/models?author=…` |
| Lapa LLM description | https://dou.ua/lenta/news/lapa-llm-release/ |
| Gemma Terms of Use | https://ai.google.dev/gemma/terms |
| Gemma 4 sizes, languages, Apache 2.0 | https://huggingface.co/google/gemma-4-E4B-it |
| Qwen 3.5 languages, Apache 2.0 | https://huggingface.co/Qwen/Qwen3.5-9B |
| Ukrainian leaderboard (secondary) | https://dev.ua/news/liderbord-llm-iaki-shariat-ukrainsku-1766502718 |

## Unverified (measure or check before relying on it)

- Training time for experiment c on the M4 Pro: the 10–30 minutes is extrapolated.
- QLoRA memory and speed for 4B/12B on 24 GB: the table is arithmetic, not a measured run. The first experiment-a run should log `mlx_lm.lora` peak memory.
- The default macOS GPU wired-memory cap on a 24 GB machine.
- Ukrainian writing quality of Gemma 4 and Qwen 3.5, and whether the leaderboard covers them.
- MamayLM v2.0 weights availability: the INSAIT announcement page returned HTTP 429, so this rests on its absence from Hugging Face.
- Llama-family models were not assessed. Their community licence is more restrictive, and nothing points to better Ukrainian.
