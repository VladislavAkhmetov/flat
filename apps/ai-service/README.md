# AI Service — Floor Plan Recognition

FastAPI-микросервис: стены, двери/окна и мебель по растровому плану.
**Только бесплатный / open-source стек** (без платных recognition API).

## Features

- **Style router**: `cad_outline` / `marketing_filled` / `photo_messy`
- **Каскад стен**:
  - marketing/photo → **Mask2Former** (HF `phungpx/mask2former-swin-base-cubicassa`)
  - CAD → YOLOv8-seg → CubiCasa5k U-Net
  - fallback → OpenCV + auto-threshold
- **Wall graph**: skeleton / medial-axis → одна осевая линия на стену (не двойные контуры)
- **OCR комнат (RU)**: EasyOCR читает «Ванная / Кухня / Прихожая…» → тип комнаты → шаблон мебели
- **Мебель и символы**: YOLOv8 + `SemanticLayoutPlanner` (с clamp в контур квартиры)
- **Окна/двери**: seal gaps + детектор белых врезок в наружных стенах
- **Единый масштаб**: downscale ≤1500px; `px_per_meter` по ширине дверей (~0.85 м)
- **Content crop**: обрезка пустых полей перед детекцией
- **Неблокирующий API**: CV/NN в `ThreadPoolExecutor`

## Installation

```powershell
py -m pip install -r requirements.txt
```

При первом запуске Mask2Former скачает веса с Hugging Face (~400MB в кэш).

## Usage

```powershell
py server.py
```

По умолчанию: `http://localhost:5000` (клиенты виджета задают URL через `VITE_AI_URL`).

### POST `/process-plan`

```bash
curl -X POST -F "file=@plan.png" http://localhost:5000/process-plan
```

Опционально: `threshold` (только ручной слайдер), `grayscale`, `contrast`.

Пример ответа:

```json
{
  "walls": [
    {"start": {"x": 100, "y": 200}, "end": {"x": 500, "y": 200}, "thickness": 0.25, "kind": "bearing"}
  ],
  "furniture": [],
  "image_width": 1500,
  "image_height": 1200,
  "method": "mask2former",
  "style": "marketing_filled",
  "px_per_meter": 42.5,
  "num_walls": 15
}
```

### GET `/health`

Статус сервиса и загрузки моделей.

## Architecture

1. Decode → alpha blend → downscale → content crop  
2. `detect_plan_style`  
3. Wall cascade (Mask2Former / YOLO-seg / U-Net / OpenCV)  
4. Skeleton → wall segments + topology/connectivity filters  
5. Furniture YOLO → `estimate_px_per_meter` → planner  
6. JSON  

## Key files

| File | Role |
|------|------|
| `server.py` | FastAPI, executor, cascade |
| `style_router.py` | CAD vs marketing vs photo |
| `mask2former_walls.py` | HF Mask2Former wall mask |
| `wall_graph.py` | Skeleton → walls[] |
| `inference.py` | U-Net / YOLO-seg |
| `furniture_detection.py` | YOLO furniture |
| `semantic_planner.py` | Rooms, openings, furniture |

## Testing

```powershell
py smoke_recognition.py path\to\plan.png
```

## Notes

- Без GPU Mask2Former заметно медленнее
- Слайдер «Чувствительность» на фронте шлёт `threshold` только после ручного движения
- CubiCasa U-Net веса могут скачаться при первом старте (~100MB)
