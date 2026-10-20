# Vendored PixAI Tagger model code

`tagger_pipeline.py` is copied **unmodified** from the model repository, so it can be diffed against
upstream without noise. Do not edit it here; re-copy it when upstream changes.

- Source: `pixai-labs/pixai-tagger-v1.0` on Hugging Face
- Revision: `9fe10addf9326e292da8a85a98ea74cd91b41771`
- SHA256 of `tagger_pipeline.py`: `3431279FDFFF234F62664999FC1FE6BB20F1E8756F7435D0E165EBD4456F7FCD`
- License: Apache-2.0 (declared by the model repository; the repository itself ships no LICENSE file)

Vendoring it keeps the node from executing code that arrives with a downloaded model
(`trust_remote_code=True`), and lets the weights folder contain only `config.json` plus the
safetensors file. The node imports `ViTDetClsConfig`, `ViTDetCls` and passes `RescalePadProcessor`'s
resize/pad/normalize behaviour through `_preprocess_image` in `../../pixai_tagger_node.py`.

Upstream code depends on `transformers` (custom `PreTrainedModel` + `BaseImageProcessor`),
`timm` and `torchvision`.
