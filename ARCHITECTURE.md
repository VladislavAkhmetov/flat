# Flat Builder — Интерактивный 3D Планировщик Квартир

## Описание проекта

Flat Builder — это веб-виджет для интерактивного просмотра и редактирования планировок квартир в 2D и 3D. Продукт предназначен для встраивания на сайты застройщиков и агентств недвижимости: пользователь загружает растровый план квартиры, система автоматически распознаёт стены и расставляет мебель с помощью ИИ, после чего покупатель может интерактивно расставить мебель, обойти квартиру в режиме «от первого лица» и оставить заявку.

---

## Функционал

### Редактирование планировки
- **Загрузка плана** — загрузка растрового изображения планировки (PNG/JPG, поддержка прозрачного фона), которое отображается как подложка в сцене.
- **Автораспознавание стен (ИИ)** — после загрузки плана ИИ-сервис автоматически детектирует стены и возвращает их векторное представление.
- **Ручное рисование стен** — режим рисования стен мышью с системой магнитного прилипания (snap): к сетке, к другим стенам, к углам 90°.
- **Редактирование стен** — перемещение, удаление стен; изменение толщины и типа (несущая / перегородка).
- **Двери и окна (Проёмы)** — добавление проёмов на стены с указанием ширины, высоты и высоты подоконника.
- **Граф стен** — стены хранятся в виде графа узлов (Node-Edge архитектура): узлы — это углы, рёбра — сами стены. Это позволяет корректно обрабатывать примыкания и T-образные соединения.

### Расстановка мебели
- **Каталог мебели** — боковая панель с предметами мебели (диван, кровать, стол, стул, шкаф и др.).
- **Drag & drop** — размещение мебели в 3D сцене перетаскиванием из каталога.
- **Привязка к стене** — мебель может автоматически прилипать к ближайшей стене.
- **Трансформация** — вращение, масштабирование, перемещение объектов.
- **Свойства объекта** — панель редактирования выбранного объекта.

### Режимы просмотра
- **2D (вид сверху)** — ортографическая камера, удобна для редактирования плана.
- **3D (орбитальная камера)** — перспективный вид, возможность облёта сцены.
- **Вид от первого лица (Walk mode)** — управление WASD + мышь, иммерсивный обход квартиры.

### Сохранение и шаринг
- **Сохранение сцены** — сцена сохраняется на сервере и возвращается уникальный токен (`shareToken`).
- **Загрузка по токену** — восстановление полного состояния сцены по URL с токеном.
- **Форма заявки (Лид)** — форма с именем, телефоном и комментарием; данные сохраняются в БД и могут быть переданы в CRM (Bitrix24 через вебхук).

---

## Архитектура

Проект организован как **монорепозиторий** (`npm workspaces` + `turbo`). Состоит из трёх приложений и одной общей библиотеки.

```
flat/
├── apps/
│   ├── widget-frontend/   # React/Three.js фронтенд (порт 5173)
│   ├── api-backend/       # Fastify REST API + Prisma ORM (порт 3000)
│   └── ai-service/        # Python/FastAPI ИИ-микросервис (порт 5000)
├── packages/
│   └── shared/            # Общие TypeScript-типы для front и back
├── infra/
│   └── docker-compose.yml # PostgreSQL 15 для локальной разработки
├── package.json            # Корневой workspace
└── ARCHITECTURE.md         # Этот файл
```

---

## Компоненты

### 1. `packages/shared` — Общие типы

Используется как фронтендом, так и бэкендом. Содержит все ключевые интерфейсы данных.

| Тип               | Описание                                                              |
|-------------------|-----------------------------------------------------------------------|
| `SceneData`       | Главная структура сцены: стены, узлы, рёбра, проёмы, мебель, камера |
| `Wall`            | Устаревший формат стены (для обратной совместимости): точки A и B    |
| `WallNode`        | Узел графа стен (угол): координаты X, Y                              |
| `WallEdge`        | Ребро графа стен: два узла + толщина, высота, тип                    |
| `Opening`         | Проём (дверь / окно) на стене: позиция t ∈ [0,1], размеры           |
| `FurnitureObject` | Объект мебели: catalogId, позиция, поворот, масштаб                  |
| `MaterialMap`     | Маппинг материалов: пол и стены                                      |
| `CameraState`     | Состояние камеры: режим (2d/3d/walk), позиция, цель, FOV             |
| `LeadPayload`     | Данные формы заявки: имя, телефон, комментарий, ID сцены             |

---

### 2. `apps/widget-frontend` — Фронтенд-виджет

**Стек**: React 18, TypeScript, Vite, Three.js, `@react-three/fiber`, `@react-three/drei`, Zustand, TailwindCSS, Lucide Icons.

#### Ключевые компоненты

| Файл                          | Назначение                                                              |
|-------------------------------|-------------------------------------------------------------------------|
| `src/main.tsx`                | Точка входа, рендер `<App/>`                                            |
| `src/App.tsx`                 | Корневой компонент: компоновка UI и 3D Canvas                           |
| `src/store.ts`                | Глобальный стор Zustand: стены, узлы, мебель, режимы редактора         |
| `src/catalog.ts`              | Каталог мебели: список объектов с геометрией и мета-данными            |
| `components/SceneContainer`   | 3D Canvas с освещением, тенями, OrbitControls / FirstPersonControls    |
| `components/WallLayer`        | 3D рендер стен по данным из стора (ThreeJS Geometry)                   |
| `components/WallGraph`        | Граф стен: рендер узлов и рёбер для визуальной отладки                 |
| `components/WallBuilder`      | Режим рисования стен мышью с раймкастингом на плоскость пола           |
| `components/WallEditor`       | Режим выделения и перемещения стен                                      |
| `components/FurniturePlacer`  | Размещение мебели из каталога в 3D сцене                               |
| `components/FurniturePrimitives` | 3D примитивы для визуализации мебели (Box, Cylinder и т.д.)         |
| `components/ObjectLayer`      | Рендер всех объектов мебели в сцене                                     |
| `components/PlanUnderlay`     | Отображение загруженного растрового плана как текстуры на полу          |
| `components/PlanUploader`     | Компонент загрузки PNG/JPG плана (с отправкой на AI и backend)         |
| `components/CatalogPanel`     | Боковая панель каталога мебели                                          |
| `components/EditorToolbar`    | Верхняя панель инструментов: переключение режимов                       |
| `components/FirstPersonController` | Управление камерой в режиме Walk (WASD + мышь + pointer lock)    |
| `components/LeadForm`         | Форма заявки пользователя                                               |
| `components/ObjectProperties` | Панель свойств выбранного объекта мебели                               |
| `components/WallProperties`   | Панель свойств выбранной стены                                          |
| `components/OpeningProperties`| Панель свойств выбранного проёма                                        |
| `components/OpacitySlider`    | Слайдер прозрачности для скрытия подложки/стен                         |
| `hooks/useSnapSystem`         | Хук системы привязки: магнит к сетке, стенам, углам                   |

#### Поток данных (фронтенд)

```
PlanUploader
  └─→ POST /api/upload (backend)   ← загрузка изображения
  └─→ POST /process-plan (ai)      ← распознавание стен
  └─→ store: setWalls(), setNodes(), setEdges()
      └─→ WallLayer, WallGraph     ← рендер результата
          └─→ WallBuilder / WallEditor ← ручное редактирование
              └─→ POST /api/scenes  ← сохранение
                  └─→ POST /api/leads ← заявка
```

---

### 3. `apps/api-backend` — REST API

**Стек**: Node.js, TypeScript, Fastify 4, `@fastify/multipart`, `@fastify/static`, `@fastify/cors`, Prisma ORM, PostgreSQL, UUID.

**Порт**: `3000`

#### Эндпоинты

| Метод | Путь                    | Описание                                                     |
|-------|-------------------------|--------------------------------------------------------------|
| GET   | `/health`               | Проверка работоспособности сервера                           |
| POST  | `/api/upload`           | Загрузка изображения планировки, возвращает URL              |
| GET   | `/api/uploads/:filename`| Ручная отдача загруженных файлов (fallback для static)       |
| POST  | `/api/scenes`           | Сохранение сцены (SceneData), возвращает `sceneId` и `token` |
| GET   | `/api/scenes/:token`    | Загрузка сцены по токену                                     |
| POST  | `/api/leads`            | Создание заявки, опционально — отправка вебхука в Bitrix24   |

#### Схема БД (Prisma, PostgreSQL)

```prisma
model Scene {
  id        String   @id @default(uuid())
  token     String   @unique          // 8-символьный токен для шаринга
  data      Json                      // Полный SceneData JSON
  createdAt DateTime @default(now())
  leads     Lead[]
}

model Lead {
  id        String   @id @default(uuid())
  name      String
  phone     String
  comment   String?
  sceneId   String
  scene     Scene    @relation(...)
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

### 4. `apps/ai-service` — ИИ Микросервис

**Стек**: Python 3.12, FastAPI, Uvicorn, PyTorch (CUDA), `segmentation-models-pytorch`, YOLOv8 (Ultralytics), OpenCV, Pillow, NumPy, scikit-learn.

**Порт**: `5000`

#### Эндпоинты

| Метод | Путь             | Описание                                                    |
|-------|------------------|-------------------------------------------------------------|
| GET   | `/health`        | Статус сервиса и флаг загрузки модели                       |
| POST  | `/process-plan`  | Обработка изображения плана: детекция стен + мебели         |

#### Пайплайн обработки плана (`POST /process-plan`)

```
Загрузка изображения
  └─→ Предобработка
       ├─ Удаление альфа-канала (белый фон)
       ├─ Grayscale Color Burn (опционально)
       └─ CLAHE контраст (опционально)
  └─→ Детекция насыщенности (is_colored?)
  └─→ Определение стен (каскад методов):
       1. YOLOv8-seg (weights/yolov8_walls_seg.pt) — если не цветной план и веса есть
       2. U-Net ResNet34 / CubiCasa5k (cubicasa5k_model.pth) — если не цветной план
       3. OpenCV Fallback (двухэтапная морфология) — всегда как запасной вариант
  └─→ Постобработка стен:
       ├─ Фильтрация дубликатов (filter_duplicate_walls)
       └─ Слияние коллинеарных стен (merge_collinear_walls)
  └─→ Детекция мебели и символов (YOLOv8 marketing_furniture.pt)
  └─→ Семантическое планирование (SemanticLayoutPlanner)
       ├─ Классификация комнат (спальня / гостиная / кухня / ванная / коридор)
       ├─ Расстановка дверей и окон (openings)
       └─ Расстановка мебели по типу комнаты (furniture)
  └─→ JSON-ответ: { walls, furniture, image_width, image_height, method }
```

#### Модели и веса

| Файл                                   | Назначение                                     |
|----------------------------------------|------------------------------------------------|
| `weights/cubicasa5k_model.pth`         | U-Net (ResNet34) для сегментации стен CAD-планов |
| `weights/marketing_furniture.pt`       | YOLOv8 детектор мебели и символов (обучен)     |
| `weights/yolov8_walls_seg.pt`          | YOLOv8-seg для стен (опционально, не включён)  |
| `weights/architect_furniture.pt`       | Запасная/тренировочная версия детектора         |
| `yolov8n.pt`                           | Базовая YOLOv8 nano (для тренировки)           |

#### Классы детектора мебели (YOLOv8)

| ID | Класс    | Тип объекта      |
|----|----------|------------------|
| 0  | `bathtub`| Ванна            |
| 1  | `bed`    | Кровать          |
| 2  | `door1`  | Дверь (тип 1)    |
| 3  | `desk`   | Рабочий стол     |
| 4  | `sink1`  | Раковина (тип 1) |
| 5  | `sink2`  | Раковина (тип 2) |
| 6  | `sink3`  | Раковина (тип 3) |
| 7  | `sink4`  | Раковина (тип 4) |
| 8  | `sofa1`  | Диван            |
| 9  | `toilet` | Унитаз           |
| 10 | `table1` | Стол (тип 1)     |
| 11 | `table2` | Стол (тип 2)     |
| 14 | `window1`| Окно             |

---

## Инфраструктура

### Docker (локальная разработка)

`infra/docker-compose.yml` запускает только базу данных PostgreSQL:

```yaml
services:
  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: flat_user
      POSTGRES_PASSWORD: flat_password
      POSTGRES_DB: flat_db
```

### Переменные окружения

Файл `.env` (в корне и в `apps/api-backend`):

```env
DATABASE_URL="postgresql://flat_user:flat_password@localhost:5432/flat_db?schema=public"
BITRIX_WEBHOOK_URL="https://your-domain.bitrix24.com/rest/1/token/crm.lead.add"
STORAGE_BUCKET="flat-widget-assets"
YC_SERVICE_ACCOUNT_ID="your-sa-id"
```

---

## Инструкции по запуску

### Требования

- **Node.js** >= 18 (проверено на v22.11.0)
- **Python** >= 3.10 (проверено на 3.12.2)
- **CUDA** >= 11.x (рекомендуется, опционально — работает на CPU)
- **Docker Desktop** — для запуска PostgreSQL локально
- **npm** >= 9

### 1. Первый запуск

```powershell
# 1. Установить Node.js-зависимости (все workspaces)
npm install

# 2. Установить Python-зависимости (в папке ai-service)
cd apps/ai-service
py -m pip install -r requirements.txt
cd ../..

# 3. Запустить PostgreSQL через Docker
docker compose -f infra/docker-compose.yml up -d

# 4. Применить миграции базы данных
npm run prisma:migrate -w apps/api-backend

# (или вручную)
cd apps/api-backend
npx prisma migrate dev
cd ../..
```

### 2. Запуск всех сервисов (dev-режим)

```powershell
npm run dev
```

Эта команда запускает через `concurrently`:
- `[0]` **api-backend** — `ts-node-dev src/app.ts` → http://localhost:3000
- `[1]` **widget-frontend** — `vite` → http://localhost:5173
- `[2]` **ai-service** — `python server.py` → http://localhost:5000

### 3. Запуск сервисов по отдельности

```powershell
# Только фронтенд
npm run dev -w apps/widget-frontend

# Только бэкенд
npm run dev -w apps/api-backend

# Только ИИ-сервис (из папки ai-service)
cd apps/ai-service
py server.py
```

### 4. Сборка для продакшена

```powershell
npm run build
```

### 5. Деплой

Используется скрипт `deploy.ps1` в корне проекта (Yandex Cloud / Docker).

---

## Тестирование ИИ-сервиса

### Проверка работоспособности

```powershell
# Проверить статус
Invoke-RestMethod http://localhost:5000/health

# Загрузить тестовый план
curl -X POST -F "file=@test_flat.png" http://localhost:5000/process-plan
```

### Тестовые скрипты (в `apps/ai-service`)

```powershell
cd apps/ai-service

# Проверить подключение к API
py test_api.py

# Проверить детектор мебели
py test_furniture.py

# Проверить YOLO
py test_yolo.py

# Отладка пайплайна
py debug_ai.py
```

---

## Структура данных сцены (SceneData)

```typescript
interface SceneData {
  schemaVersion: "1.0";

  // Устаревшее (backward compat)
  walls: Wall[];

  // Граф стен (актуальное)
  nodes: WallNode[];           // Угловые точки стен
  edges: WallEdge[];           // Стены между узлами

  openings: Opening[];         // Двери и окна
  objects: FurnitureObject[];  // Мебель
  materials: MaterialMap;      // Материалы пола и стен
  camera: CameraState;         // Состояние камеры
  constraints?: Constraints;   // Стояки, зоны запрета застройки
  planImage?: string | { url, width, height } | null; // Подложка-план
}
```

---

## Известные особенности и ограничения

- **Цветные планы**: Нейросетевые модели (U-Net, YOLO-walls) обучены на CAD-чертежах и плохо работают с цветными маркетинговыми планами. Для цветных планов автоматически используется OpenCV-фолбэк.
- **Мебель**: Если детектор мебели не находит предметов, `SemanticLayoutPlanner` генерирует мебель автоматически на основе площади и типа комнаты.
- **PostgreSQL**: Для локальной разработки необходим запущенный Docker с контейнером `flat_postgres` (или любой другой PostgreSQL на порту 5432 с указанными credentials).
- **CUDA**: Ускорение GPU используется автоматически если CUDA доступна. Без GPU инференс замедляется в 5–10 раз.
- **Веса модели YOLO walls**: Файл `weights/yolov8_walls_seg.pt` не включён в репозиторий. При его отсутствии wall-детекция выполняется через U-Net или OpenCV.

---

## Разработка

### Добавление новой мебели в каталог

Редактируйте файл `apps/widget-frontend/src/catalog.ts`:

```typescript
{
  id: 'my-item',
  name: 'Название',
  category: 'living',           // bedroom / bathroom / kitchen / living
  geometry: { w: 1.0, d: 0.5, h: 0.8 }, // размеры в метрах
  color: '#8B7355',
}
```

### Добавление нового API-эндпоинта (бэкенд)

Добавьте handler в `apps/api-backend/src/app.ts`:

```typescript
server.get('/api/my-route', async (request, reply) => {
  return { data: 'hello' };
});
```

### Добавление нового класса мебели (ИИ)

1. Добавьте изображения в `apps/ai-service/data/`.
2. Обновите `dataset.py` с новым классом.
3. Запустите `train_furniture.py` для дообучения.
4. Обновите маппинг классов в `furniture_detection.py` и `semantic_planner.py`.
