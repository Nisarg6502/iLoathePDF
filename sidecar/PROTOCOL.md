# Sidecar protocol (FROZEN CONTRACT)

Newline-delimited JSON over stdin/stdout between the Rust core and the Python
sidecar. **stdout carries protocol messages only** — all logging goes to stderr.

Do not change this file without updating `src/lib/jobs.ts` and every `sidecar/ops/*.py`
in the same commit. Downstream agents code against it and must not edit it.

## Request (Rust -> Python), one JSON object per line

```json
{"id": "j1", "op": "pdf.merge", "params": { }}
```

`id` is a caller-generated unique string. `op` is one of the operations below.

## Responses (Python -> Rust), zero or more progress lines then exactly one terminal line

```json
{"id":"j1","type":"progress","pct":40,"note":"page 4 of 10"}
{"id":"j1","type":"result","data":{ }}
{"id":"j1","type":"error","code":"ENCRYPTED_PDF","message":"human readable","detail":"traceback"}
```

`pct` is 0-100. `result` and `error` are terminal: exactly one is emitted per `id`.

## Error codes

| Code | Meaning |
| --- | --- |
| `BAD_PARAMS` | Missing or malformed params |
| `FILE_NOT_FOUND` | An input path does not exist |
| `ENCRYPTED_PDF` | PDF is password protected |
| `CORRUPT_PDF` | PDF could not be parsed |
| `UNSUPPORTED_FORMAT` | Image/file format not supported |
| `GHOSTSCRIPT_MISSING` | Ghostscript binary not found (compress/rasterise) |
| `OUTPUT_WRITE_FAILED` | Could not write the output file |
| `CANCELLED` | Job cancelled by the user |
| `INTERNAL` | Unexpected error; `detail` holds the traceback |

## Operations

### `sys.ping`
params: `{}` -> result: `{"pong": true, "version": "0.1.0", "python": "3.11.3"}`

### `sys.cancel`
params: `{"target": "j1"}` -> result: `{"cancelled": true}`
Sets the cancel flag for job `j1`. That job then terminates with error `CANCELLED`.

### `pdf.info`
params: `{"input": "abs path"}`
result: `{"pages": 12, "encrypted": false, "bytes": 90210, "page_sizes": [[595.0, 842.0]]}`

### `pdf.merge`
params:
```json
{"inputs": [{"path": "a.pdf", "pages": "1-3,5"}, {"path": "b.pdf"}],
 "output": "abs path to merged.pdf"}
```
`pages` is an optional 1-based range spec; omitted or null means all pages.
result: `{"output": "...", "bytes": 128432, "pages": 8}`

### `pdf.split`
params:
```json
{"input": "a.pdf", "mode": "ranges|every|extract|delete",
 "ranges": "1-3,4-6", "every": 2, "pages": "2,5-7",
 "output_dir": "abs dir", "base_name": "a"}
```
- `ranges` -> one output file per comma-separated range (uses `ranges`)
- `every`  -> split into chunks of N pages (uses `every`)
- `extract`-> one output containing only `pages`
- `delete` -> one output with `pages` removed

result: `{"outputs": [{"path": "...", "bytes": 1024, "pages": 3}], "count": 2}`

### `pdf.organize`
params:
```json
{"input": "a.pdf", "output": "out.pdf",
 "order": [0, 2, 1], "rotations": {"0": 90, "2": 180}}
```
`order` is 0-based source page indices in the desired output order (pages absent
from `order` are dropped). `rotations` maps **source** page index (string key,
because JSON) to absolute rotation in degrees: 0, 90, 180 or 270.
result: `{"output": "...", "bytes": 1024, "pages": 3}`

### `pdf.compress`
params:
```json
{"input": "a.pdf", "output": "out.pdf", "level": "lossless|balanced|strong"}
```
`lossless` uses pikepdf stream recompression only. `balanced` and `strong` use
Ghostscript (`/ebook` and `/screen`). If Ghostscript is unavailable, those levels
fail with `GHOSTSCRIPT_MISSING` rather than silently falling back.
result: `{"output": "...", "bytes": 51200, "original_bytes": 204800, "ratio": 0.75, "engine": "ghostscript"}`

### `img.convert`
params:
```json
{"inputs": ["a.heic", "b.png"], "output_dir": "abs dir",
 "format": "jpg|png|webp", "quality": 85,
 "resize": {"mode": "none|max|percent", "max_px": 2000, "percent": 50},
 "strip_metadata": true, "background": "#FFFFFF"}
```
`background` is composited under transparency when the target format has no alpha
(i.e. jpg). EXIF orientation is always applied before saving.
result: `{"outputs": [{"path": "...", "bytes": 1024, "width": 800, "height": 600}], "count": 2}`

### `img.to_pdf`
params:
```json
{"inputs": ["a.jpg", "b.heic"], "output": "out.pdf",
 "page_size": "fit|a4|letter", "orientation": "auto|portrait|landscape",
 "margin_mm": 0}
```
`fit` makes each page exactly the image size. HEIC inputs are transcoded to JPEG
in a temp dir first, because img2pdf only embeds JPEG/PNG losslessly.
result: `{"output": "...", "bytes": 1024, "pages": 2}`

### `pdf.to_img`
params:
```json
{"input": "a.pdf", "output_dir": "abs dir", "format": "png|jpg",
 "dpi": 150, "pages": "1-3", "base_name": "a"}
```
result: `{"outputs": [{"path": "...", "bytes": 1024}], "count": 3}`

## Page range spec

Used by `pages` and `ranges`. 1-based, inclusive. Grammar: comma-separated items,
each either `N` or `A-B` (with `A <= B`). Whitespace ignored. `"1-3,5,8-9"` selects
pages 1,2,3,5,8,9. Out-of-bounds or malformed specs raise `BAD_PARAMS`.
