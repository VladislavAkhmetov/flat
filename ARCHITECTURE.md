# Flat Builder — Интерактивный 3D Планировщик Квартир

## Описание проекта

Flat Builder — веб-виджет для интерактивного просмотра и редактирования планировок квартир в 2D и 3D. Продукт предназначен для встраивания на сайты застройщиков и агентств недвижимости: пользователь загружает растровый план квартиры, система автоматически распознаёт стены и расставляет мебель с помощью ИИ, после чего покупатель может интерактивно расставить мебель, обойти квартиру в режиме «от первого лица» и оставить заявку.

---

## Функционал

### Редактирование планировки
- **Загрузка плана** — PNG/JPG (в т.ч. с прозрачным фоном); изображение становится подложкой в сцене.
- **Автораспознавание (ИИ)** — детекция стен, дверей/окон и мебели; масштаб калибруется по ширине дверей (`px_per_meter`), а не жёстко «10 м на картинку».
- **Ручное рисование стен** — snap к сетке, стенам и углам 90°; визуальный фидбек (курсор, фантомная линия, размеры) обновляется императивно без React re-render на каждый `pointermove`.
- **Редактирование стен** — перемещение узлов, удаление, толщина и тип (несущая / перегородка).
- **Двери и окна** — проёмы на рёбрах графа; элементы каталога категории `opening` ставятся через `addOpening`, а не как мебель.
- **Граф стен** — Node–Edge: узлы — углы, рёбра — стены (примыкания и T-соединения).

### Расстановка мебели
- **Каталог** — боковая панель (диван, кровать, стол, стул, шкаф и др.).
- **Размещение** — клик/перетаскивание в сцену с snap к стенам графа (`nodes`/`edges`) и legacy-стенам.
- **Трансформация** — вращение, масштаб, перемещение; панель свойств выбранного объекта.

### Режимы просмотра
- **2D** — ортографическая камера для редактирования плана.
- **3D** — орбитальный облёт; `Environment` (apartment), hemisphere + directional light, `ContactShadows` только в этом режиме.
- **Walk** — WASD + мышь, FOV 60°, скорость ~2 м/с (Shift — бег), коллизии со стенами с проходом через дверные проёмы, прицел-перекрестие.

### Сохранение и шаринг
- **Сохранение сцены** — сервер возвращает `shareToken`.
- **Загрузка по токену** — полное восстановление сцены по URL.
- **Лид** — имя, телефон, комментарий; `sceneId` опционален (заявка с лендинга/пресета не требует FK на сцену). Опционально — вебхук Bitrix24.
- **Undo/Redo** — `structuredClone`, лимит 50 шагов; AI-импорт батчится в одну запись истории.

---

## Архитектура

Монорепозиторий: **npm workspaces** + **Turborepo** (`turbo.json`).

```
flat/
├── apps/
│   ├── widget-frontend/   # React/Three.js виджет (порт 5173)
│   ├── api-backend/       # Fastify + Prisma (порт 3000)
│   └── ai-service/        # FastAPI / PyTorch / YOLO (порт 5000)
├── packages/
│   └── shared/            # Общие TypeScript-типы
├── infra/
│   └── docker-compose.yml # PostgreSQL 15
├── turbo.json             # pipeline: build / test / lint
├── .env.example           # DATABASE_URL, PUBLIC_URL, VITE_* URL
├── package.json
└── ARCHITECTURE.md
```

```
┌──────────────────┐     ┌─────────────┐
│  widget-frontend │────▶│ api-backend │
│      :5173       │     │    :3000    │
└────────┬─────────┘     └──────┬──────┘
         │                      │
         ▼                      ▼
  ┌─────────────┐        ┌────────────┐
  │ ai-service  │        │ PostgreSQL │
  │    :5000    │        │    :5432   │
  └─────────────┘        └────────────┘
```

URL сервисов на клиентах задаются через env (`VITE_API_URL`, `VITE_AI_URL`, `VITE_WIDGET_URL`); на бэкенде — `PUBLIC_URL` для ссылок на загруженные файлы. Fallback в коде — localhost для локальной разработки.

---

## Компоненты

### 1. `packages/shared` — Общие типы

| Тип               | Описание                                                              |
|-------------------|-----------------------------------------------------------------------|
| `SceneData`       | Главная структура сцены: стены, узлы, рёбра, проёмы, мебель, камера |
| `Wall`            | Legacy-стена (точки A/B) для обратной совместимости                  |
| `WallNode`        | Узел графа (угол)                                                    |
| `WallEdge`        | Ребро: два узла + толщина, высота, тип                               |
| `Opening`         | Проём на стене: `t ∈ [0,1]`, размеры                                 |
| `FurnitureObject` | Мебель: catalogId, позиция, поворот, масштаб                         |
| `MaterialMap`     | Материалы пола и стен                                                |
| `CameraState`     | Режим (2d/3d/walk), позиция, цель, FOV                               |
| `LeadPayload`     | Заявка: имя, телефон, комментарий, опциональный ID сцены             |

---

### 2. `apps/widget-frontend` — Фронтенд-виджет

**Стек**: React 18, TypeScript, Vite, Three.js, `@react-three/fiber`, `@react-three/drei`, Zustand, TailwindCSS, Lucide Icons.

#### Ключевые файлы

| Файл                          | Назначение                                                              |
|-------------------------------|-------------------------------------------------------------------------|
| `src/store.ts`                | Zustand: сцена, режимы, undo/redo (`structuredClone`, лимит 50, batch) |
| `src/catalog.ts`              | Каталог мебели и проёмов                                               |
| `components/SceneContainer`   | Canvas, освещение, Environment, камеры, ContactShadows (только 3d)     |
| `components/WallGraph`        | Рёбра/узлы; Line2 с dispose; Door3D от пола (y=0)                      |
| `components/WallEditor`       | Рисование/проёмы: snap + phantom через refs/`useFrame`                 |
| `components/FurniturePlacer`  | Snap к graph walls; openings → `addOpening`                            |
| `components/ObjectLayer`      | Рендер мебели                                                          |
| `components/PlanUploader`     | Upload → AI (`VITE_AI_URL`) → масштаб по `px_per_meter` → store        |
| `components/FirstPersonController` | Walk: скорость, Shift-бег, коллизии + двери                       |
| `components/ShareModal`       | Шаринг; прямая ссылка на клиентский 3D-просмотр (`client.html`)                     |
| `components/AIRenderModal`    | AI-рендер превью; `VITE_API_URL`                                       |
| `hooks/useSnapSystem`         | `computeSnap` + хук привязки                                           |

#### Поток данных

```
PlanUploader
  └─→ POST {VITE_API_URL}/upload
  └─→ POST {VITE_AI_URL}/process-plan  → walls, furniture, px_per_meter
  └─→ beginHistoryBatch → setNodes/Edges/Objects → endHistoryBatch
      └─→ WallGraph / ObjectLayer
          └─→ POST {VITE_API_URL}/scenes | /leads
```

#### Производительность (hot path)
- Узкие Zustand-селекторы (не подписываться на весь `scene`).
- `WallEditor` / drag-фидбек — refs + `useFrame`, без `setState` на каждый move.
- `EdgeLine`: геометрия/материалы в `useMemo` + `dispose` при размонтировании.
- Тени: `castShadow` только у directional light.

---

### 3. `apps/api-backend` — REST API

**Стек**: Node.js, TypeScript, Fastify 4, multipart/static/cors, Prisma, PostgreSQL.

**Порт**: `3000`

| Метод | Путь                     | Описание                                                     |
|-------|--------------------------|--------------------------------------------------------------|
| GET   | `/health`                | Healthcheck                                                  |
| POST  | `/api/upload`            | Загрузка изображения; URL = `PUBLIC_URL` или host запроса    |
| GET   | `/api/uploads/:filename` | Отдача файлов                                                |
| POST  | `/api/scenes`            | Сохранение `SceneData` → `sceneId` + token                   |
| GET   | `/api/scenes/:token`     | Загрузка сцены по токену                                     |
| POST  | `/api/leads`             | Заявка; `sceneId` опционален; опционально Bitrix24           |

#### Схема БД (фрагмент)

```prisma
model Scene {
  id        String   @id @default(uuid())
  token     String   @unique
  data      Json
  createdAt DateTime @default(now())
  leads     Lead[]
}

model Lead {
  id        String   @id @default(uuid())
  name      String
  phone     String
  comment   String?
  sceneId   String?          // опционально — лиды с лендинга/пресетов
  scene     Scene?   @relation(...)
  createdAt DateTime @default(now())
}

model Event {
  id        String   @id @default(uuid())
  type      String
  payload   Json
  createdAt DateTime @default(now())
}
```

---

### 4. `apps/ai-service` — ИИ-микросервис

**Стек**: Python 3.12, FastAPI, Uvicorn, PyTorch (CUDA), SMP, YOLOv8, OpenCV, NumPy.

**Порт**: `5000`

Синхронный CV/NN пайплайн выполняется в `ThreadPoolExecutor` (`run_in_executor`), чтобы не блокировать event loop FastAPI. Лимит загрузки ~20 МБ; длинная сторона изображения ограничивается `MAX_IMAGE_DIM = 1500` **один раз** в начале — все модули (YOLO, U-Net, OpenCV, planner) работают в одной системе координат.

| Метод | Путь             | Описание                                            |
|-------|------------------|-----------------------------------------------------|
| GET   | `/health`        | Статус и флаг загрузки модели                       |
| POST  | `/process-plan`  | Стены + мебель/проёмы + `px_per_meter`              |

#### Пайплайн `POST /process-plan`

```
Загрузка + проверка размера
  └─→ Downscale до MAX_IMAGE_DIM (единая СК)
  └─→ Векторизованное снятие альфы → белый фон
  └─→ CLAHE / предобработка (по типу плана)
  └─→ is_colored?
  └─→ Стены (каскад):
       1. YOLOv8-seg (если есть веса, не цветной)
       2. U-Net ResNet34 / CubiCasa5k (не цветной)
       3. OpenCV fallback (морфология + контуры/Hough)
  └─→ filter_duplicate_walls / merge_collinear_walls
  └─→ YOLO furniture (порог дверей/окон ≥ 0.18)
  └─→ estimate_px_per_meter (по ширине door ≈ 0.85 м; иначе max(h,w)/10)
  └─→ SemanticLayoutPlanner(h, w, px_per_meter)
       ├─ комнаты, openings (snap к стенам без жёсткого отсева по ориентации)
       └─ мебель по типу комнаты / детекциям
  └─→ JSON: { walls, furniture, image_width, image_height, method, px_per_meter }
```

#### Модели и веса

| Файл                                   | Назначение                                       |
|----------------------------------------|--------------------------------------------------|
| `weights/cubicasa5k_model.pth`         | U-Net (ResNet34) сегментация стен CAD            |
| `weights/marketing_furniture.pt`       | YOLOv8 мебель и символы                          |
| `weights/yolov8_walls_seg.pt`          | YOLOv8-seg стен (опционально)                    |
| `weights/architect_furniture.pt`       | Запасной детектор                                |

Нормализация U-Net (`mean`/`std`) всегда на `self.device` (исправлен рассинхрон CPU/CUDA, из‑за которого пайплайн молча уходил в OpenCV).

#### Классы детектора мебели (YOLOv8)

| ID | Класс     | Объект        |
|----|-----------|---------------|
| 0  | `bathtub` | Ванна         |
| 1  | `bed`     | Кровать       |
| 2  | `door1`   | Дверь         |
| 3  | `desk`    | Стол          |
| 4–7| `sink*`   | Раковины      |
| 8  | `sofa1`   | Диван         |
| 9  | `toilet`  | Унитаз        |
| 10–11 | `table*` | Столы       |
| 14 | `window1` | Окно          |

---

## Инфраструктура

### Docker

`infra/docker-compose.yml` — только PostgreSQL 15:

```yaml
services:
  postgres:
    image: postgres:15-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: flat_user
      POSTGRES_PASSWORD: flat_password
      POSTGRES_DB: flat_db
```

### Переменные окружения

См. корневой `.env.example`:

```env
DATABASE_URL="postgresql://flat_user:flat_password@localhost:5432/flat_db?schema=public"
BITRIX_WEBHOOK_URL="https://your-domain.bitrix24.com/rest/1/token/crm.lead.add"
PUBLIC_URL="http://localhost:3000"

# Vite-приложения (apps/widget-frontend/.env, apps/landing/.env)
VITE_API_URL="http://localhost:3000/api"
VITE_AI_URL="http://localhost:5000"
VITE_WIDGET_URL="http://localhost:5173"
```

### Turborepo

`turbo.json`: задачи `build` (outputs `dist/**`, dependsOn `^build`), `test`, `lint`. Корневые скрипты: `npm run build|test|lint` → `turbo run …`.

---

## Инструкции по запуску

### Требования

- Node.js ≥ 18, npm ≥ 9
- Python ≥ 3.10 (проверено на 3.12)
- CUDA ≥ 11.x (опционально)
- Docker Desktop — PostgreSQL локально

### 1. Первый запуск

```powershell
npm install

cd apps/ai-service
py -m pip install -r requirements.txt
cd ../..

docker compose -f infra/docker-compose.yml up -d

npm run prisma:migrate -w apps/api-backend
# или: cd apps/api-backend; npx prisma migrate dev
```

Скопируйте `.env.example` → `.env` (корень / backend) и при необходимости `apps/*/ .env` для Vite.

### 2. Dev (все сервисы)

```powershell
npm run dev
```

Через `concurrently`:
- `[0]` api-backend → http://localhost:3000
- `[1]` widget-frontend → http://localhost:5173
- `[2]` ai-service → http://localhost:5000

### 3. По отдельности

```powershell
npm run dev -w apps/widget-frontend
npm run dev -w apps/api-backend
cd apps/ai-service; py server.py
```

### 4. Сборка

```powershell
npm run build   # turbo run build
```

### 5. Деплой

Скрипт `deploy.ps1` (Yandex Cloud / Docker).

---

## Тестирование ИИ-сервиса

```powershell
Invoke-RestMethod http://localhost:5000/health

curl -X POST -F "file=@test_flat.png" http://localhost:5000/process-plan
```

Ответ включает `walls`, `furniture`, `image_width`, `image_height`, `method`, `px_per_meter`.

Тестовый CLI-скрипт: `apps/ai-service/smoke_recognition.py`.

---

## Структура данных сцены (SceneData)

```typescript
interface SceneData {
  schemaVersion: "1.0";
  walls: Wall[];                 // legacy
  nodes: WallNode[];
  edges: WallEdge[];
  openings: Opening[];
  objects: FurnitureObject[];
  materials: MaterialMap;
  camera: CameraState;
  constraints?: Constraints;
  planImage?: string | { url, width, height } | null;
}
```

Масштаб при импорте из AI: `meters = pixels / px_per_meter` (поле ответа AI); fallback — `max(width, height) / 10`.

---

## Известные особенности и ограничения

- **Цветные планы**: U-Net / YOLO-walls заточены под CAD; для цветных маркетинговых планов — OpenCV-фолбэк.
- **Мебель**: при слабой детекции `SemanticLayoutPlanner` дополняет расстановку по площади и типу комнаты.
- **Координаты**: всё после первого downscale — в пикселях уменьшенного изображения; фронт масштабирует через `px_per_meter`.
- **PostgreSQL**: нужен контейнер/`DATABASE_URL` на :5432.
- **CUDA**: без GPU инференс заметно медленнее; устройство тензоров нормализации U-Net должно совпадать с устройством модели.
- **Веса YOLO walls**: `yolov8_walls_seg.pt` может отсутствовать в репозитории — тогда U-Net или OpenCV.
- **Бандл виджета**: production-чанк ~1.3 MB — кандидат на code-splitting (P2).

---

## Разработка

### Новая мебель в каталог

`apps/widget-frontend/src/catalog.ts`:

```typescript
{
  id: 'my-item',
  name: 'Название',
  category: 'living', // bedroom | bathroom | kitchen | living | opening
  geometry: { w: 1.0, d: 0.5, h: 0.8 },
  color: '#8B7355',
}
```

### Новый API-эндпоинт

`apps/api-backend/src/app.ts`:

```typescript
server.get('/api/my-route', async () => ({ data: 'hello' }));
```

### Новый класс мебели (ИИ)

1. Данные в `apps/ai-service/data/`.
2. Класс в `dataset.py`.
3. `train_furniture.py`.
4. Маппинг в `furniture_detection.py` и `semantic_planner.py`.
